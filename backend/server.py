"""
CONEXIA CLM - Contract Lifecycle Management Backend.
FastAPI + MongoDB + Emergent Google Auth + Claude Sonnet AI Copilot.
"""
import os
import uuid
import logging
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Conexia CLM API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("conexia")


# ---------- Helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def doc_clean(d: dict) -> dict:
    """Convert mongo doc to JSON-safe dict (handle datetime, drop _id)."""
    if not d:
        return d
    out = {}
    for k, v in d.items():
        if k == "_id":
            continue
        if isinstance(v, datetime):
            out[k] = iso(v)
        elif isinstance(v, list):
            out[k] = [doc_clean(x) if isinstance(x, dict) else (iso(x) if isinstance(x, datetime) else x) for x in v]
        elif isinstance(v, dict):
            out[k] = doc_clean(v)
        else:
            out[k] = v
    return out


# ---------- Models ----------
Role = Literal["legal", "finance", "operations", "direction", "field"]
ContractStatus = Literal["draft", "in_review", "approved", "signed", "active", "expiring", "closed"]
WorkflowStep = Literal["legal", "finance", "operations", "direction"]
RiskLevel = Literal["low", "medium", "high"]


class SessionRequest(BaseModel):
    session_id: str


class UserPublic(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: Role = "operations"
    department: Optional[str] = None


class ContractCreate(BaseModel):
    title: str
    counterparty: str
    description: Optional[str] = ""
    total_value: float
    currency: str = "USD"
    start_date: datetime
    end_date: datetime
    milestones: List[dict] = Field(default_factory=list)  # [{name, due_date, value}]
    department: Optional[str] = None


class WorkflowStepStatus(BaseModel):
    step: WorkflowStep
    status: Literal["pending", "approved", "rejected"] = "pending"
    approver_id: Optional[str] = None
    approver_name: Optional[str] = None
    decided_at: Optional[datetime] = None
    note: Optional[str] = None


class TimelineEvent(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    at: datetime = Field(default_factory=now_utc)
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    kind: str  # created | updated | workflow | addendum | evidence | signed | ai_analysis
    message: str


class Contract(BaseModel):
    contract_id: str
    title: str
    counterparty: str
    description: str = ""
    total_value: float
    currency: str = "USD"
    start_date: datetime
    end_date: datetime
    status: ContractStatus = "draft"
    workflow: List[WorkflowStepStatus] = Field(default_factory=list)
    milestones: List[dict] = Field(default_factory=list)
    executed_value: float = 0.0
    retention_value: float = 0.0
    penalty_value: float = 0.0
    risk_level: RiskLevel = "low"
    parent_contract_id: Optional[str] = None  # for addenda
    department: Optional[str] = None
    owner_id: str
    created_at: datetime
    updated_at: datetime
    timeline: List[TimelineEvent] = Field(default_factory=list)


class AddendumCreate(BaseModel):
    title: str
    description: str = ""
    value_delta: float = 0.0  # +/- adjustment
    end_date_delta_days: int = 0


class EvidenceCreate(BaseModel):
    contract_id: str
    milestone_name: Optional[str] = None
    note: Optional[str] = ""
    image_base64: str  # data URI or raw base64
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_m: Optional[float] = None


class WorkflowDecision(BaseModel):
    step: WorkflowStep
    decision: Literal["approved", "rejected"]
    note: Optional[str] = ""


class AIAnalyzeRequest(BaseModel):
    contract_id: Optional[str] = None
    contract_text: str


# ---------- Auth ----------
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < now_utc():
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@api.post("/auth/session")
async def create_session(req: SessionRequest):
    """Exchange Emergent session_id for backend session token."""
    async with httpx.AsyncClient(timeout=20.0) as cx:
        r = await cx.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = data["email"]

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing.get("name")), "picture": data.get("picture")}},
        )
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name", email.split("@")[0]),
            "picture": data.get("picture"),
            "role": "direction",  # first-time users get exec view; demo
            "department": "Executive",
            "created_at": now_utc(),
        }
        await db.users.insert_one(user)
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})

    token = data["session_token"]
    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": token},
        {"$set": {"session_token": token, "user_id": user_id, "expires_at": expires_at, "created_at": now_utc()}},
        upsert=True,
    )
    return {"session_token": token, "user": doc_clean(user)}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return doc_clean(user)


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api.post("/auth/dev-login")
async def dev_login(email: str = "demo@conexia.io"):
    """Dev/demo bypass to obtain a session for the seeded demo user. For preview only."""
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if not existing:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        existing = {
            "user_id": user_id,
            "email": email,
            "name": "Demo Director",
            "picture": None,
            "role": "direction",
            "department": "Executive",
            "created_at": now_utc(),
        }
        await db.users.insert_one(existing)
        existing = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    token = f"dev_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": existing["user_id"],
        "expires_at": now_utc() + timedelta(days=7),
        "created_at": now_utc(),
    })
    return {"session_token": token, "user": doc_clean(existing)}


# ---------- Workflow / risk helpers ----------
def default_workflow() -> List[dict]:
    return [
        {"step": s, "status": "pending", "approver_id": None, "approver_name": None, "decided_at": None, "note": None}
        for s in ["legal", "finance", "operations", "direction"]
    ]


def compute_risk(contract: dict) -> str:
    end_date = contract.get("end_date")
    if isinstance(end_date, str):
        end_date = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    if end_date and end_date.tzinfo is None:
        end_date = end_date.replace(tzinfo=timezone.utc)
    days_to_end = (end_date - now_utc()).days if end_date else 999
    penalty = float(contract.get("penalty_value", 0) or 0)
    value = float(contract.get("total_value", 0) or 1)
    if penalty / max(value, 1) > 0.05 or days_to_end < 7:
        return "high"
    if days_to_end < 30:
        return "medium"
    return "low"


def compute_status(contract: dict) -> str:
    status = contract.get("status", "draft")
    if status in ("draft", "in_review", "approved"):
        return status
    end_date = contract.get("end_date")
    if isinstance(end_date, str):
        end_date = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    if end_date and end_date.tzinfo is None:
        end_date = end_date.replace(tzinfo=timezone.utc)
    if end_date and end_date < now_utc():
        return "closed"
    if end_date and (end_date - now_utc()).days <= 30 and status in ("signed", "active"):
        return "expiring"
    return status


# ---------- Contracts ----------
@api.post("/contracts")
async def create_contract(payload: ContractCreate, user=Depends(get_current_user)):
    cid = f"ctr_{uuid.uuid4().hex[:10]}"
    contract = {
        "contract_id": cid,
        "title": payload.title,
        "counterparty": payload.counterparty,
        "description": payload.description or "",
        "total_value": payload.total_value,
        "currency": payload.currency,
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "status": "draft",
        "workflow": default_workflow(),
        "milestones": payload.milestones or [],
        "executed_value": 0.0,
        "retention_value": payload.total_value * 0.05,
        "penalty_value": 0.0,
        "risk_level": "low",
        "parent_contract_id": None,
        "department": payload.department,
        "owner_id": user["user_id"],
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "timeline": [{
            "id": uuid.uuid4().hex,
            "at": now_utc(),
            "actor_id": user["user_id"],
            "actor_name": user["name"],
            "kind": "created",
            "message": f"Contract drafted by {user['name']}",
        }],
    }
    contract["risk_level"] = compute_risk(contract)
    await db.contracts.insert_one(contract.copy())
    fresh = await db.contracts.find_one({"contract_id": cid}, {"_id": 0})
    return doc_clean(fresh)


@api.get("/contracts")
async def list_contracts(status: Optional[str] = None, user=Depends(get_current_user)):
    q = {"parent_contract_id": None}
    if status and status != "all":
        q["status"] = status
    cursor = db.contracts.find(q, {"_id": 0}).sort("created_at", -1)
    items = []
    async for c in cursor:
        c["status"] = compute_status(c)
        c["risk_level"] = compute_risk(c)
        items.append(doc_clean(c))
    return items


@api.get("/contracts/{contract_id}")
async def get_contract(contract_id: str, user=Depends(get_current_user)):
    c = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contract not found")
    c["status"] = compute_status(c)
    c["risk_level"] = compute_risk(c)
    # attach addenda and evidence counts
    addenda_cursor = db.contracts.find({"parent_contract_id": contract_id}, {"_id": 0})
    addenda = [doc_clean(a) async for a in addenda_cursor]
    ev_count = await db.evidence.count_documents({"contract_id": contract_id})
    out = doc_clean(c)
    out["addenda"] = addenda
    out["evidence_count"] = ev_count
    return out


@api.post("/contracts/{contract_id}/workflow")
async def workflow_decision(contract_id: str, decision: WorkflowDecision, user=Depends(get_current_user)):
    c = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contract not found")
    workflow = c.get("workflow") or default_workflow()
    updated_step = None
    for step in workflow:
        if step["step"] == decision.step:
            step["status"] = decision.decision
            step["approver_id"] = user["user_id"]
            step["approver_name"] = user["name"]
            step["decided_at"] = now_utc()
            step["note"] = decision.note
            updated_step = step
            break
    if not updated_step:
        raise HTTPException(400, "Invalid step")

    # compute global status
    all_approved = all(s["status"] == "approved" for s in workflow)
    any_rejected = any(s["status"] == "rejected" for s in workflow)
    new_status = c.get("status", "draft")
    if any_rejected:
        new_status = "draft"
    elif all_approved:
        new_status = "approved"
    else:
        new_status = "in_review"

    event = {
        "id": uuid.uuid4().hex,
        "at": now_utc(),
        "actor_id": user["user_id"],
        "actor_name": user["name"],
        "kind": "workflow",
        "message": f"{decision.step.title()} {decision.decision} by {user['name']}",
    }

    await db.contracts.update_one(
        {"contract_id": contract_id},
        {
            "$set": {"workflow": workflow, "status": new_status, "updated_at": now_utc()},
            "$push": {"timeline": event},
        },
    )
    fresh = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    return doc_clean(fresh)


@api.post("/contracts/{contract_id}/sign")
async def sign_contract(contract_id: str, user=Depends(get_current_user)):
    c = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contract not found")
    audit = {
        "id": uuid.uuid4().hex,
        "at": now_utc(),
        "actor_id": user["user_id"],
        "actor_name": user["name"],
        "kind": "signed",
        "message": f"E-signature applied (MOCK). Audit hash: {uuid.uuid4().hex[:16]}",
    }
    await db.contracts.update_one(
        {"contract_id": contract_id},
        {"$set": {"status": "signed", "updated_at": now_utc(), "locked": True},
         "$push": {"timeline": audit}},
    )
    fresh = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    return doc_clean(fresh)


@api.post("/contracts/{contract_id}/addenda")
async def create_addendum(contract_id: str, payload: AddendumCreate, user=Depends(get_current_user)):
    parent = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    if not parent:
        raise HTTPException(404, "Parent contract not found")
    end_date = parent["end_date"]
    if isinstance(end_date, str):
        end_date = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    new_end = end_date + timedelta(days=payload.end_date_delta_days)
    new_value = float(parent["total_value"]) + payload.value_delta
    aid = f"add_{uuid.uuid4().hex[:10]}"
    addendum = {
        "contract_id": aid,
        "title": payload.title,
        "counterparty": parent["counterparty"],
        "description": payload.description,
        "total_value": new_value,
        "currency": parent["currency"],
        "start_date": parent["start_date"],
        "end_date": new_end,
        "status": "in_review",
        "workflow": default_workflow(),
        "milestones": [],
        "executed_value": 0.0,
        "retention_value": new_value * 0.05,
        "penalty_value": 0.0,
        "risk_level": "low",
        "parent_contract_id": contract_id,
        "department": parent.get("department"),
        "owner_id": user["user_id"],
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "value_delta": payload.value_delta,
        "end_date_delta_days": payload.end_date_delta_days,
        "timeline": [{
            "id": uuid.uuid4().hex, "at": now_utc(),
            "actor_id": user["user_id"], "actor_name": user["name"],
            "kind": "created", "message": f"Addendum '{payload.title}' created",
        }],
    }
    await db.contracts.insert_one(addendum.copy())
    # add event in parent
    await db.contracts.update_one(
        {"contract_id": contract_id},
        {"$push": {"timeline": {
            "id": uuid.uuid4().hex, "at": now_utc(),
            "actor_id": user["user_id"], "actor_name": user["name"],
            "kind": "addendum", "message": f"Addendum added: {payload.title} (Δ {payload.value_delta:+.2f})",
        }}},
    )
    fresh = await db.contracts.find_one({"contract_id": aid}, {"_id": 0})
    return doc_clean(fresh)


# ---------- Evidence ----------
@api.post("/evidence")
async def create_evidence(payload: EvidenceCreate, user=Depends(get_current_user)):
    contract = await db.contracts.find_one({"contract_id": payload.contract_id}, {"_id": 0})
    if not contract:
        raise HTTPException(404, "Contract not found")
    eid = f"ev_{uuid.uuid4().hex[:10]}"
    ev = {
        "evidence_id": eid,
        "contract_id": payload.contract_id,
        "milestone_name": payload.milestone_name,
        "note": payload.note or "",
        "image_base64": payload.image_base64,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy_m": payload.accuracy_m,
        "captured_by_id": user["user_id"],
        "captured_by_name": user["name"],
        "captured_at": now_utc(),
        "immutable_hash": uuid.uuid4().hex,
    }
    await db.evidence.insert_one(ev.copy())
    # timeline event on contract
    await db.contracts.update_one(
        {"contract_id": payload.contract_id},
        {"$push": {"timeline": {
            "id": uuid.uuid4().hex, "at": now_utc(),
            "actor_id": user["user_id"], "actor_name": user["name"],
            "kind": "evidence",
            "message": f"Field evidence captured at {payload.latitude:.4f},{payload.longitude:.4f}"
                       if payload.latitude is not None and payload.longitude is not None
                       else "Field evidence captured",
        }}},
    )
    # return without large base64
    out = {**ev, "image_base64": ev["image_base64"][:80] + "..."}
    return doc_clean(out)


@api.get("/evidence")
async def list_evidence(contract_id: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if contract_id:
        q["contract_id"] = contract_id
    cursor = db.evidence.find(q, {"_id": 0}).sort("captured_at", -1).limit(200)
    items = []
    async for e in cursor:
        items.append(doc_clean(e))
    return items


@api.get("/evidence/{evidence_id}")
async def get_evidence(evidence_id: str, user=Depends(get_current_user)):
    e = await db.evidence.find_one({"evidence_id": evidence_id}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Evidence not found")
    return doc_clean(e)


# ---------- Dashboard ----------
@api.get("/dashboard")
async def dashboard(user=Depends(get_current_user)):
    contracts_cursor = db.contracts.find({"parent_contract_id": None}, {"_id": 0})
    contracts = [c async for c in contracts_cursor]
    for c in contracts:
        c["status"] = compute_status(c)
        c["risk_level"] = compute_risk(c)

    total_value = sum(float(c.get("total_value", 0) or 0) for c in contracts)
    executed = sum(float(c.get("executed_value", 0) or 0) for c in contracts)
    retention = sum(float(c.get("retention_value", 0) or 0) for c in contracts)
    penalties = sum(float(c.get("penalty_value", 0) or 0) for c in contracts)
    active = sum(1 for c in contracts if c["status"] in ("signed", "active", "expiring"))
    in_review = sum(1 for c in contracts if c["status"] in ("draft", "in_review", "approved"))

    # alerts: contracts expiring within 60 days, in priority order
    alerts = []
    for c in contracts:
        end = c.get("end_date")
        if isinstance(end, str):
            end = datetime.fromisoformat(end.replace("Z", "+00:00"))
        if end and end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if not end:
            continue
        days = (end - now_utc()).days
        if days < 0:
            continue
        if days <= 60:
            level = "high" if days <= 7 else ("medium" if days <= 30 else "low")
            alerts.append({
                "contract_id": c["contract_id"],
                "title": c["title"],
                "counterparty": c.get("counterparty"),
                "days_to_end": days,
                "level": level,
                "value": c.get("total_value"),
                "currency": c.get("currency", "USD"),
                "end_date": iso(end),
            })
    alerts.sort(key=lambda x: x["days_to_end"])

    return {
        "kpis": {
            "total_value": total_value,
            "executed": executed,
            "retention": retention,
            "penalties": penalties,
            "active": active,
            "in_review": in_review,
            "total_contracts": len(contracts),
        },
        "alerts": alerts[:10],
        "recent": [doc_clean(c) for c in sorted(contracts, key=lambda x: x.get("updated_at") or x.get("created_at"), reverse=True)[:5]],
    }


# ---------- AI Copilot ----------
SYSTEM_PROMPT = """You are CONEXIA AI Copilot, an enterprise contract analyst.
Analyze the contract text and return STRICT JSON with this exact schema and nothing else (no markdown fences):
{
  "summary": "1-2 sentence executive summary in Spanish",
  "key_dates": [{"label": "string", "date": "YYYY-MM-DD"}],
  "financial_obligations": [{"label": "string", "amount": number, "currency": "string", "due": "YYYY-MM-DD or null"}],
  "risk_clauses": [{"clause": "string", "severity": "low|medium|high", "reason": "string"}],
  "overall_risk": "low|medium|high"
}
Be concise. If a section has no data, return an empty array."""


@api.post("/ai/analyze")
async def ai_analyze(req: AIAnalyzeRequest, user=Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI key missing")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except Exception as e:
        log.exception("emergentintegrations import failed")
        raise HTTPException(500, f"AI library unavailable: {e}")

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"analyze_{uuid.uuid4().hex[:10]}",
        system_message=SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-6")

    msg = UserMessage(text=f"Analyze the following contract text and respond with the JSON schema:\n\n{req.contract_text}")
    try:
        resp = await chat.send_message(msg)
    except Exception as e:
        log.exception("AI call failed")
        raise HTTPException(502, f"AI provider error: {e}")

    text = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
    # try to parse JSON, salvage fenced
    import json, re
    payload = None
    try:
        payload = json.loads(text)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                payload = json.loads(m.group(0))
            except Exception:
                payload = None
    if payload is None:
        payload = {"summary": text[:300], "key_dates": [], "financial_obligations": [], "risk_clauses": [], "overall_risk": "low"}

    if req.contract_id:
        await db.contracts.update_one(
            {"contract_id": req.contract_id},
            {"$set": {"ai_analysis": payload, "updated_at": now_utc()},
             "$push": {"timeline": {
                 "id": uuid.uuid4().hex, "at": now_utc(),
                 "actor_id": user["user_id"], "actor_name": user["name"],
                 "kind": "ai_analysis", "message": "AI Copilot analyzed contract",
             }}},
        )
    return payload


# ---------- Seed ----------
@api.post("/seed")
async def seed_demo():
    """Idempotent demo seed: ensures demo user and a handful of contracts/evidence."""
    user = await db.users.find_one({"email": "demo@conexia.io"}, {"_id": 0})
    if not user:
        uid = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": uid, "email": "demo@conexia.io", "name": "Demo Director",
            "picture": None, "role": "direction", "department": "Executive",
            "created_at": now_utc(),
        }
        await db.users.insert_one(user)

    existing = await db.contracts.count_documents({})
    if existing > 0:
        return {"ok": True, "skipped": True, "contracts": existing}

    samples = [
        {
            "title": "Construcción Planta Solar Norte",
            "counterparty": "Solaria Andina S.A.",
            "description": "EPC para 30MWp en Antofagasta",
            "total_value": 4_500_000, "currency": "USD",
            "days_to_end": 18, "executed": 1_800_000, "penalty": 35_000,
            "status": "active", "wf_all_approved": True,
        },
        {
            "title": "Servicio Mantención Subestación Centro",
            "counterparty": "Energía Andes Ltda.",
            "description": "Mantención preventiva y correctiva 24 meses",
            "total_value": 820_000, "currency": "USD",
            "days_to_end": 55, "executed": 410_000, "penalty": 0,
            "status": "signed", "wf_all_approved": True,
        },
        {
            "title": "Suministro Equipos Mineros Fase II",
            "counterparty": "Minería del Pacífico",
            "description": "Compra y logística de equipos pesados",
            "total_value": 12_300_000, "currency": "USD",
            "days_to_end": 240, "executed": 0, "penalty": 0,
            "status": "in_review", "wf_all_approved": False,
        },
        {
            "title": "Consultoría Legal Internacional",
            "counterparty": "Baker Global LLP",
            "description": "Asesoría regulatoria eIDAS/UETA",
            "total_value": 180_000, "currency": "USD",
            "days_to_end": 5, "executed": 150_000, "penalty": 12_000,
            "status": "active", "wf_all_approved": True,
        },
        {
            "title": "Obra Civil Bodegas Logísticas",
            "counterparty": "Construcciones Riesco",
            "description": "10.000 m² centro logístico",
            "total_value": 2_700_000, "currency": "USD",
            "days_to_end": 95, "executed": 900_000, "penalty": 0,
            "status": "active", "wf_all_approved": True,
        },
    ]
    for s in samples:
        start = now_utc() - timedelta(days=90)
        end = now_utc() + timedelta(days=s["days_to_end"])
        wf = default_workflow()
        if s["wf_all_approved"]:
            for step in wf:
                step["status"] = "approved"
                step["approver_name"] = "Demo Approver"
                step["decided_at"] = now_utc() - timedelta(days=60)
        else:
            wf[0]["status"] = "approved"; wf[0]["approver_name"] = "Demo Legal"; wf[0]["decided_at"] = now_utc() - timedelta(days=10)
            wf[1]["status"] = "pending"
        c = {
            "contract_id": f"ctr_{uuid.uuid4().hex[:10]}",
            "title": s["title"], "counterparty": s["counterparty"],
            "description": s["description"], "total_value": s["total_value"],
            "currency": s["currency"], "start_date": start, "end_date": end,
            "status": s["status"], "workflow": wf,
            "milestones": [
                {"name": "Hito 1 - Movilización", "due_date": iso(start + timedelta(days=30)), "value": s["total_value"] * 0.2},
                {"name": "Hito 2 - Avance 50%", "due_date": iso(start + timedelta(days=120)), "value": s["total_value"] * 0.3},
                {"name": "Hito 3 - Entrega Final", "due_date": iso(end), "value": s["total_value"] * 0.5},
            ],
            "executed_value": s["executed"], "retention_value": s["total_value"] * 0.05,
            "penalty_value": s["penalty"], "risk_level": "low",
            "parent_contract_id": None, "department": "Operaciones",
            "owner_id": user["user_id"],
            "created_at": now_utc() - timedelta(days=90),
            "updated_at": now_utc() - timedelta(days=2),
            "timeline": [
                {"id": uuid.uuid4().hex, "at": now_utc() - timedelta(days=90),
                 "actor_id": user["user_id"], "actor_name": user["name"],
                 "kind": "created", "message": "Contrato creado en sistema CONEXIA"},
                {"id": uuid.uuid4().hex, "at": now_utc() - timedelta(days=85),
                 "actor_id": user["user_id"], "actor_name": user["name"],
                 "kind": "workflow", "message": "Legal aprobó la redacción"},
            ],
        }
        c["risk_level"] = compute_risk(c)
        await db.contracts.insert_one(c)
    return {"ok": True, "seeded": len(samples)}


# ---------- Health ----------
@api.get("/")
async def root():
    return {"app": "Conexia CLM", "status": "ok"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    try:
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass
    await db.contracts.create_index("contract_id", unique=True)
    await db.contracts.create_index("parent_contract_id")
    await db.evidence.create_index("evidence_id", unique=True)
    await db.evidence.create_index("contract_id")
    log.info("Conexia CLM ready.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
