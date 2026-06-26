"""CONEXIA CLM Backend v2 — multi-category contracts, email/password + Google auth, sub-modules."""
import os
import re
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field, EmailStr

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Conexia CLM API v2")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("conexia")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt):
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def doc_clean(d):
    if d is None:
        return d
    if isinstance(d, list):
        return [doc_clean(x) for x in d]
    if not isinstance(d, dict):
        if isinstance(d, datetime):
            return iso(d)
        return d
    out = {}
    for k, v in d.items():
        if k in ("_id", "password_hash"):
            continue
        if isinstance(v, datetime):
            out[k] = iso(v)
        elif isinstance(v, list):
            out[k] = [doc_clean(x) for x in v]
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
ContractCategory = Literal[
    "bienes", "obras", "servicios_no_consultoria",
    "consultor_individual", "firma_consultora", "acuerdo_marco",
]


class SessionRequest(BaseModel):
    session_id: str


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str
    password: str
    department: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ContractCreate(BaseModel):
    title: str
    counterparty: str
    description: Optional[str] = ""
    total_value: float = 0
    currency: str = "USD"
    start_date: datetime
    end_date: datetime
    category: ContractCategory = "bienes"
    category_fields: dict = Field(default_factory=dict)
    department: Optional[str] = None
    contract_number: Optional[str] = None
    consultant: Optional[str] = None
    product: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    delivery_date: Optional[datetime] = None
    pay_pct: float = 0
    observations: Optional[str] = ""


class WorkflowDecision(BaseModel):
    step: WorkflowStep
    decision: Literal["approved", "rejected"]
    note: Optional[str] = ""


class AddendumCreate(BaseModel):
    title: str
    description: str = ""
    value_delta: float = 0.0
    end_date_delta_days: int = 0


class EvidenceCreate(BaseModel):
    contract_id: str
    milestone_name: Optional[str] = None
    note: Optional[str] = ""
    image_base64: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_m: Optional[float] = None


class AIAnalyzeRequest(BaseModel):
    contract_id: Optional[str] = None
    contract_text: str


class RiskCreate(BaseModel):
    risk: str
    probability: Literal["low", "medium", "high"] = "medium"
    impact: Literal["low", "medium", "high"] = "medium"
    mitigation: str = ""
    responsible: str = ""
    status: Literal["open", "monitoring", "closed"] = "open"


class ModificationCreate(BaseModel):
    type: Literal["amendment", "extension", "scope_change", "termination"] = "amendment"
    date: datetime
    amount: float = 0
    days: int = 0
    justification: str = ""
    approval: Literal["pending", "approved", "rejected"] = "pending"


class PaymentCreate(BaseModel):
    invoice: str
    date: datetime
    amount: float
    deliverable: str = ""
    status: Literal["pending", "paid", "rejected"] = "pending"


class ESFItemCreate(BaseModel):
    requirement: str
    compliant: bool = False
    verification_date: Optional[datetime] = None
    observations: str = ""


# ---------- Auth helpers ----------
async def get_current_user(authorization: Optional[str] = Header(None)):
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


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


async def create_session_for(user_id: str) -> str:
    token = f"sess_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": token, "user_id": user_id,
        "expires_at": now_utc() + timedelta(days=7), "created_at": now_utc(),
    })
    return token


# ---------- Auth endpoints ----------
@api.post("/auth/register")
async def register(req: RegisterRequest):
    if len(req.password) < 6:
        raise HTTPException(400, "La contraseña debe tener al menos 6 caracteres")
    if not re.match(r"^[^@]+@[^@]+\.[^@]+$", req.email):
        raise HTTPException(400, "Email inválido")
    existing = await db.users.find_one({"email": req.email}, {"_id": 0})
    if existing:
        raise HTTPException(409, "Ya existe una cuenta con ese email")
    uid = f"user_{uuid.uuid4().hex[:12]}"
    user = {
        "user_id": uid, "email": req.email, "name": req.name,
        "picture": None, "role": "operations", "department": req.department or "",
        "auth_provider": "password", "password_hash": hash_password(req.password),
        "created_at": now_utc(), "locale": "es",
    }
    await db.users.insert_one(user)
    token = await create_session_for(uid)
    fresh = await db.users.find_one({"user_id": uid}, {"_id": 0})
    return {"session_token": token, "user": doc_clean(fresh)}


@api.post("/auth/login")
async def login(req: LoginRequest):
    user = await db.users.find_one({"email": req.email})
    if not user or not user.get("password_hash"):
        raise HTTPException(401, "Credenciales incorrectas")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Credenciales incorrectas")
    token = await create_session_for(user["user_id"])
    user.pop("_id", None)
    return {"session_token": token, "user": doc_clean(user)}


@api.post("/auth/session")
async def create_session_google(req: SessionRequest):
    async with httpx.AsyncClient(timeout=20.0) as cx:
        r = await cx.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session_id")
    data = r.json()
    email = data["email"]
    existing = await db.users.find_one({"email": email})
    if existing:
        uid = existing["user_id"]
        await db.users.update_one({"user_id": uid}, {"$set": {
            "name": data.get("name", existing.get("name")), "picture": data.get("picture"),
        }})
    else:
        uid = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": uid, "email": email, "name": data.get("name", email.split("@")[0]),
            "picture": data.get("picture"), "role": "direction", "department": "Executive",
            "auth_provider": "google", "created_at": now_utc(), "locale": "es",
        })
    token = data["session_token"]
    await db.user_sessions.update_one({"session_token": token}, {"$set": {
        "session_token": token, "user_id": uid,
        "expires_at": now_utc() + timedelta(days=7), "created_at": now_utc(),
    }}, upsert=True)
    user = await db.users.find_one({"user_id": uid}, {"_id": 0})
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


@api.post("/auth/locale")
async def set_locale(payload: dict, user=Depends(get_current_user)):
    locale = payload.get("locale", "es")
    if locale not in ("es", "en"):
        raise HTTPException(400, "Locale must be 'es' or 'en'")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"locale": locale}})
    return {"ok": True, "locale": locale}


@api.post("/auth/dev-login")
async def dev_login(email: str = "demo@conexia.io"):
    existing = await db.users.find_one({"email": email})
    if not existing:
        uid = f"user_{uuid.uuid4().hex[:12]}"
        existing = {
            "user_id": uid, "email": email, "name": "Demo Director",
            "picture": None, "role": "direction", "department": "Executive",
            "auth_provider": "dev", "created_at": now_utc(), "locale": "es",
        }
        await db.users.insert_one(existing)
    uid = existing["user_id"]
    token = await create_session_for(uid)
    fresh = await db.users.find_one({"user_id": uid}, {"_id": 0})
    return {"session_token": token, "user": doc_clean(fresh)}


# ---------- Workflow / risk helpers ----------
def default_workflow():
    return [{"step": s, "status": "pending", "approver_id": None, "approver_name": None,
             "decided_at": None, "note": None} for s in ["legal", "finance", "operations", "direction"]]


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


def compute_risk(contract: dict) -> str:
    end_date = contract.get("end_date")
    if isinstance(end_date, str):
        end_date = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    if end_date and end_date.tzinfo is None:
        end_date = end_date.replace(tzinfo=timezone.utc)
    days_to_end = (end_date - now_utc()).days if end_date else 999
    penalty = float(contract.get("penalty_value", 0) or 0)
    value = max(float(contract.get("total_value", 0) or 1), 1)
    if penalty / value > 0.05 or days_to_end < 7:
        return "high"
    if days_to_end < 30:
        return "medium"
    return "low"


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
        "executed_value": 0.0,
        "retention_value": (payload.total_value or 0) * 0.05,
        "penalty_value": 0.0,
        "risk_level": "low",
        "parent_contract_id": None,
        "category": payload.category,
        "category_fields": payload.category_fields or {},
        "contract_number": payload.contract_number,
        "consultant": payload.consultant,
        "product": payload.product,
        "scheduled_date": payload.scheduled_date,
        "delivery_date": payload.delivery_date,
        "pay_pct": payload.pay_pct,
        "observations": payload.observations or "",
        "department": payload.department,
        "owner_id": user["user_id"],
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "risks": [], "modifications": [], "payments": [], "esf_items": [],
        "timeline": [{"id": uuid.uuid4().hex, "at": now_utc(),
                     "actor_id": user["user_id"], "actor_name": user["name"],
                     "kind": "created", "message": f"Contract drafted by {user['name']}"}],
    }
    contract["risk_level"] = compute_risk(contract)
    await db.contracts.insert_one(contract.copy())
    fresh = await db.contracts.find_one({"contract_id": cid}, {"_id": 0})
    return doc_clean(fresh)


@api.get("/contracts")
async def list_contracts(status: Optional[str] = None, category: Optional[str] = None,
                          user=Depends(get_current_user)):
    q = {"parent_contract_id": None}
    if status and status != "all":
        q["status"] = status
    if category and category != "all":
        q["category"] = category
    cursor = db.contracts.find(q, {"_id": 0}).sort("created_at", -1)
    out = []
    async for c in cursor:
        c["status"] = compute_status(c)
        c["risk_level"] = compute_risk(c)
        out.append(doc_clean(c))
    return out


@api.get("/contracts/{contract_id}")
async def get_contract(contract_id: str, user=Depends(get_current_user)):
    c = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contract not found")
    c["status"] = compute_status(c)
    c["risk_level"] = compute_risk(c)
    addenda = [doc_clean(a) async for a in db.contracts.find({"parent_contract_id": contract_id}, {"_id": 0})]
    ev_count = await db.evidence.count_documents({"contract_id": contract_id})
    out = doc_clean(c)
    out["addenda"] = addenda
    out["evidence_count"] = ev_count
    return out


def _fmt_money(v, cur="USD") -> str:
    try:
        return f"{cur} {float(v or 0):,.2f}"
    except Exception:
        return f"{cur} 0.00"


def _fmt_date(v) -> str:
    if not v:
        return "—"
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00")).strftime("%Y-%m-%d")
        except Exception:
            return v[:10]
    return str(v)


CAT_LABEL = {
    "bienes": "Bienes", "obras": "Obras",
    "servicios_no_consultoria": "Servicios No Consultoría",
    "consultor_individual": "Consultor Individual",
    "firma_consultora": "Firma Consultora",
    "acuerdo_marco": "Acuerdo Marco",
}
STATUS_LABEL = {
    "draft": "Borrador", "in_review": "En Revisión", "approved": "Aprobado",
    "signed": "Firmado", "active": "Activo", "expiring": "Por Vencer", "closed": "Cerrado",
}
RISK_LABEL = {"low": "Bajo", "medium": "Medio", "high": "Alto"}
WF_LABEL = {"legal": "Legal", "finance": "Finanzas", "operations": "Operaciones", "direction": "Dirección"}


def render_contract_html(c: dict, addenda: list) -> str:
    title = c.get("title", "")
    cnum = c.get("contract_number") or c.get("contract_id")
    counterparty = c.get("counterparty", "")
    desc = c.get("description") or ""
    cur = c.get("currency", "USD")
    cat = CAT_LABEL.get(c.get("category", ""), c.get("category", "—"))
    status = STATUS_LABEL.get(c.get("status", "draft"), c.get("status", "—"))
    risk = RISK_LABEL.get(c.get("risk_level", "low"), c.get("risk_level", "—"))
    observations = c.get("observations") or ""
    timeline = c.get("timeline") or []
    workflow = c.get("workflow") or []
    risks = c.get("risks") or []
    mods = c.get("modifications") or []
    pays = c.get("payments") or []
    esfs = c.get("esf_items") or []

    def row(label, value):
        return f'<tr><td class="lbl">{label}</td><td>{value}</td></tr>'

    wf_rows = "".join(
        f'<tr><td>{WF_LABEL.get(s.get("step",""), s.get("step",""))}</td>'
        f'<td>{STATUS_LABEL.get(s.get("status","pending"), s.get("status","—"))}</td>'
        f'<td>{s.get("approver_name") or "—"}</td>'
        f'<td>{_fmt_date(s.get("decided_at"))}</td></tr>'
        for s in workflow
    ) or '<tr><td colspan="4" class="empty">Sin pasos de aprobación</td></tr>'

    risk_rows = "".join(
        f'<tr><td>{r.get("risk","")}</td><td>{RISK_LABEL.get(r.get("probability","low"),"—")}</td>'
        f'<td>{RISK_LABEL.get(r.get("impact","low"),"—")}</td><td>{r.get("mitigation","")}</td>'
        f'<td>{r.get("responsible","")}</td><td>{STATUS_LABEL.get(r.get("status",""), r.get("status",""))}</td></tr>'
        for r in risks
    ) or '<tr><td colspan="6" class="empty">Sin riesgos registrados</td></tr>'

    mod_rows = "".join(
        f'<tr><td>{m.get("type","")}</td><td>{_fmt_date(m.get("date"))}</td>'
        f'<td>{_fmt_money(m.get("amount",0), cur)}</td><td>{m.get("days",0)}</td>'
        f'<td>{m.get("justification","")}</td>'
        f'<td>{STATUS_LABEL.get(m.get("approval",""), m.get("approval",""))}</td></tr>'
        for m in mods
    ) or '<tr><td colspan="6" class="empty">Sin modificaciones</td></tr>'

    pay_rows = "".join(
        f'<tr><td>{p.get("invoice","")}</td><td>{_fmt_date(p.get("date"))}</td>'
        f'<td>{_fmt_money(p.get("amount",0), cur)}</td>'
        f'<td>{p.get("deliverable","")}</td>'
        f'<td>{STATUS_LABEL.get(p.get("status",""), p.get("status",""))}</td></tr>'
        for p in pays
    ) or '<tr><td colspan="5" class="empty">Sin pagos registrados</td></tr>'

    esf_rows = "".join(
        f'<tr><td>{e.get("requirement","")}</td><td>{"Sí" if e.get("compliant") else "No"}</td>'
        f'<td>{_fmt_date(e.get("verification_date"))}</td>'
        f'<td>{e.get("observations","")}</td></tr>'
        for e in esfs
    ) or '<tr><td colspan="4" class="empty">Sin requisitos ESF</td></tr>'

    add_rows = "".join(
        f'<tr><td>{a.get("title","")}</td>'
        f'<td>{_fmt_money(a.get("value_delta",0), cur)}</td>'
        f'<td>{a.get("end_date_delta_days",0)}</td>'
        f'<td>{_fmt_date(a.get("created_at"))}</td></tr>'
        for a in addenda
    ) or '<tr><td colspan="4" class="empty">Sin adendas</td></tr>'

    timeline_rows = "".join(
        f'<tr><td>{_fmt_date(t.get("at"))}</td><td>{t.get("actor_name","—")}</td>'
        f'<td>{t.get("kind","")}</td><td>{t.get("message","")}</td></tr>'
        for t in (timeline[-20:] if len(timeline) > 20 else timeline)
    )

    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>{title} — {cnum}</title>
<style>
  @page {{ size: A4; margin: 18mm 14mm; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0d1414; margin: 0; padding: 24px; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #1f4a4a; padding-bottom: 12px; margin-bottom: 18px; }}
  .brand {{ color: #1f4a4a; letter-spacing: 3px; font-weight: 800; font-size: 22px; }}
  .brand small {{ display: block; letter-spacing: 2px; font-size: 9px; color: #465454; font-weight: 600; margin-top: 4px; }}
  .meta {{ text-align: right; font-size: 10px; color: #465454; }}
  h1 {{ font-size: 22px; margin: 6px 0; color: #0d1414; }}
  .sub {{ color: #465454; font-size: 13px; }}
  .pills {{ margin: 10px 0 18px; }}
  .pill {{ display: inline-block; padding: 4px 9px; font-size: 10px; font-weight: 800; letter-spacing: 0.8px; border-radius: 999px; margin-right: 6px; background: #e2ecec; color: #1f4a4a; }}
  .pill.risk-high {{ background: #ffd9d9; color: #8c1f1f; }}
  .pill.risk-med {{ background: #ffe8cc; color: #a14a00; }}
  .pill.risk-low {{ background: #d6f5d6; color: #176b17; }}
  h2 {{ font-size: 12px; letter-spacing: 1.5px; color: #1f4a4a; margin: 22px 0 8px; border-bottom: 1px solid #d8e0e0; padding-bottom: 4px; text-transform: uppercase; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 10px; }}
  th, td {{ text-align: left; padding: 6px 8px; border-bottom: 1px solid #e7ebeb; vertical-align: top; }}
  th {{ background: #f4f6f6; font-size: 10px; color: #465454; letter-spacing: 0.6px; text-transform: uppercase; }}
  .kv {{ width: 100%; }}
  .kv td.lbl {{ width: 30%; color: #465454; font-weight: 600; font-size: 11px; letter-spacing: 0.4px; }}
  .empty {{ text-align: center; color: #97a4a4; font-style: italic; padding: 10px; }}
  .footer {{ margin-top: 28px; padding-top: 10px; border-top: 1px solid #d8e0e0; font-size: 9px; color: #465454; display: flex; justify-content: space-between; }}
  .desc {{ background: #f4f6f6; border-left: 3px solid #1f4a4a; padding: 10px 12px; font-size: 12px; color: #1f2b2b; border-radius: 4px; margin-bottom: 12px; }}
  @media print {{ body {{ padding: 0; }} }}
</style></head>
<body>
  <div class="header">
    <div class="brand">CONEXIA<small>Contract Lifecycle Management</small></div>
    <div class="meta">Documento generado<br><strong>{generated}</strong><br>{cnum}</div>
  </div>

  <h1>{title}</h1>
  <div class="sub">{counterparty}</div>
  <div class="pills">
    <span class="pill">{cat.upper()}</span>
    <span class="pill">{status.upper()}</span>
    <span class="pill risk-{c.get('risk_level','low') if c.get('risk_level') in ('high','medium','low') else 'low'}">RIESGO {risk.upper()}</span>
  </div>

  {f'<div class="desc">{desc}</div>' if desc else ''}

  <h2>Información Contractual</h2>
  <table class="kv">
    {row("N° Contrato", cnum)}
    {row("Consultor / Contratista", c.get("consultant") or "—")}
    {row("Producto / Entregable", c.get("product") or "—")}
    {row("Categoría", cat)}
    {row("Departamento", c.get("department") or "—")}
    {row("Moneda", cur)}
    {row("Fecha Inicio", _fmt_date(c.get("start_date")))}
    {row("Fecha Programada", _fmt_date(c.get("scheduled_date")))}
    {row("Fecha Entrega", _fmt_date(c.get("delivery_date") or c.get("end_date")))}
    {row("Fecha Vencimiento", _fmt_date(c.get("end_date")))}
  </table>

  <h2>Indicadores Financieros</h2>
  <table class="kv">
    {row("Monto Total", _fmt_money(c.get("total_value",0), cur))}
    {row("Ejecutado", _fmt_money(c.get("executed_value",0), cur))}
    {row("Saldo", _fmt_money(float(c.get("total_value",0) or 0) - float(c.get("executed_value",0) or 0), cur))}
    {row("Retención (5%)", _fmt_money(c.get("retention_value",0), cur))}
    {row("Multas / Penalidades", _fmt_money(c.get("penalty_value",0), cur))}
    {row("% Pago", str(c.get("pay_pct", 0)) + "%")}
  </table>

  {f'<h2>Observaciones</h2><div class="desc">{observations}</div>' if observations else ''}

  <h2>Flujo de Aprobación</h2>
  <table>
    <thead><tr><th>Paso</th><th>Estado</th><th>Aprobador</th><th>Decidido</th></tr></thead>
    <tbody>{wf_rows}</tbody>
  </table>

  <h2>Matriz de Riesgos</h2>
  <table>
    <thead><tr><th>Riesgo</th><th>Probab.</th><th>Impacto</th><th>Mitigación</th><th>Responsable</th><th>Estado</th></tr></thead>
    <tbody>{risk_rows}</tbody>
  </table>

  <h2>Modificaciones</h2>
  <table>
    <thead><tr><th>Tipo</th><th>Fecha</th><th>Monto Δ</th><th>Días Δ</th><th>Justificación</th><th>Aprobación</th></tr></thead>
    <tbody>{mod_rows}</tbody>
  </table>

  <h2>Pagos</h2>
  <table>
    <thead><tr><th>Factura</th><th>Fecha</th><th>Monto</th><th>Entregable</th><th>Estado</th></tr></thead>
    <tbody>{pay_rows}</tbody>
  </table>

  <h2>ESF Ambiental-Social</h2>
  <table>
    <thead><tr><th>Requisito</th><th>Cumple</th><th>Fecha Verificación</th><th>Observaciones</th></tr></thead>
    <tbody>{esf_rows}</tbody>
  </table>

  <h2>Adendas</h2>
  <table>
    <thead><tr><th>Título</th><th>Monto Δ</th><th>Días Δ</th><th>Creada</th></tr></thead>
    <tbody>{add_rows}</tbody>
  </table>

  <h2>Línea de Tiempo (últimos 20 eventos)</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Mensaje</th></tr></thead>
    <tbody>{timeline_rows or '<tr><td colspan="4" class="empty">Sin eventos</td></tr>'}</tbody>
  </table>

  <div class="footer">
    <span>CONEXIA CLM · Documento de gestión interna</span>
    <span>Generado por sistema · No requiere firma para validez</span>
  </div>
</body></html>"""


from fastapi.responses import HTMLResponse


@api.get("/contracts/{contract_id}/document", response_class=HTMLResponse)
async def contract_document(contract_id: str, user=Depends(get_current_user)):
    c = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contract not found")
    c["status"] = compute_status(c)
    c["risk_level"] = compute_risk(c)
    addenda = [a async for a in db.contracts.find({"parent_contract_id": contract_id}, {"_id": 0})]
    html = render_contract_html(c, addenda)
    return HTMLResponse(content=html, status_code=200,
                         headers={"Cache-Control": "no-store"})


@api.post("/contracts/{contract_id}/workflow")
async def workflow_decision(contract_id: str, decision: WorkflowDecision,
                             user=Depends(get_current_user)):
    c = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contract not found")
    workflow = c.get("workflow") or default_workflow()
    updated = None
    for s in workflow:
        if s["step"] == decision.step:
            s["status"] = decision.decision; s["approver_id"] = user["user_id"]
            s["approver_name"] = user["name"]; s["decided_at"] = now_utc(); s["note"] = decision.note
            updated = s
    if not updated:
        raise HTTPException(400, "Invalid step")
    if any(s["status"] == "rejected" for s in workflow):
        new_status = "draft"
    elif all(s["status"] == "approved" for s in workflow):
        new_status = "approved"
    else:
        new_status = "in_review"
    event = {"id": uuid.uuid4().hex, "at": now_utc(),
             "actor_id": user["user_id"], "actor_name": user["name"], "kind": "workflow",
             "message": f"{decision.step.title()} {decision.decision} by {user['name']}"}
    await db.contracts.update_one({"contract_id": contract_id},
        {"$set": {"workflow": workflow, "status": new_status, "updated_at": now_utc()},
         "$push": {"timeline": event}})
    fresh = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    return doc_clean(fresh)


@api.post("/contracts/{contract_id}/sign")
async def sign_contract(contract_id: str, user=Depends(get_current_user)):
    c = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contract not found")
    if c.get("status") not in ("approved", "signed", "active"):
        raise HTTPException(400, "Solo contratos aprobados pueden firmarse")
    audit = {"id": uuid.uuid4().hex, "at": now_utc(),
             "actor_id": user["user_id"], "actor_name": user["name"], "kind": "signed",
             "message": f"E-signature applied (MOCK). Audit hash: {uuid.uuid4().hex[:16]}"}
    await db.contracts.update_one({"contract_id": contract_id},
        {"$set": {"status": "signed", "updated_at": now_utc(), "locked": True},
         "$push": {"timeline": audit}})
    fresh = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    return doc_clean(fresh)


@api.post("/contracts/{contract_id}/addenda")
async def create_addendum(contract_id: str, payload: AddendumCreate,
                           user=Depends(get_current_user)):
    parent = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    if not parent:
        raise HTTPException(404, "Parent not found")
    end_date = parent["end_date"]
    if isinstance(end_date, str):
        end_date = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    new_end = end_date + timedelta(days=payload.end_date_delta_days)
    new_value = float(parent["total_value"]) + payload.value_delta
    aid = f"add_{uuid.uuid4().hex[:10]}"
    addendum = {**parent, "contract_id": aid, "title": payload.title,
                "description": payload.description, "total_value": new_value,
                "end_date": new_end, "status": "in_review",
                "workflow": default_workflow(), "parent_contract_id": contract_id,
                "value_delta": payload.value_delta, "end_date_delta_days": payload.end_date_delta_days,
                "executed_value": 0.0, "penalty_value": 0.0,
                "retention_value": new_value * 0.05,
                "created_at": now_utc(), "updated_at": now_utc(),
                "risks": [], "modifications": [], "payments": [], "esf_items": [],
                "timeline": [{"id": uuid.uuid4().hex, "at": now_utc(),
                              "actor_id": user["user_id"], "actor_name": user["name"],
                              "kind": "created", "message": f"Addendum '{payload.title}' created"}]}
    addendum.pop("_id", None)
    await db.contracts.insert_one(addendum.copy())
    await db.contracts.update_one({"contract_id": contract_id},
        {"$push": {"timeline": {"id": uuid.uuid4().hex, "at": now_utc(),
            "actor_id": user["user_id"], "actor_name": user["name"], "kind": "addendum",
            "message": f"Addendum: {payload.title} (Δ {payload.value_delta:+.2f})"}}})
    fresh = await db.contracts.find_one({"contract_id": aid}, {"_id": 0})
    return doc_clean(fresh)


# ---------- Sub-module endpoints ----------
async def _push_subitem(contract_id: str, field: str, item: dict, user: dict, kind: str, msg: str):
    c = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contract not found")
    item["id"] = uuid.uuid4().hex
    item["created_at"] = now_utc()
    await db.contracts.update_one({"contract_id": contract_id}, {
        "$push": {field: item, "timeline": {"id": uuid.uuid4().hex, "at": now_utc(),
            "actor_id": user["user_id"], "actor_name": user["name"],
            "kind": kind, "message": msg}},
        "$set": {"updated_at": now_utc()},
    })
    fresh = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    return doc_clean(fresh)


@api.post("/contracts/{contract_id}/risks")
async def add_risk(contract_id: str, payload: RiskCreate, user=Depends(get_current_user)):
    return await _push_subitem(contract_id, "risks", payload.model_dump(), user, "risk",
                                f"Riesgo registrado: {payload.risk[:60]}")


@api.post("/contracts/{contract_id}/modifications")
async def add_modification(contract_id: str, payload: ModificationCreate, user=Depends(get_current_user)):
    return await _push_subitem(contract_id, "modifications", payload.model_dump(), user,
                                "modification", f"Modificación: {payload.type} Δ {payload.amount}")


@api.post("/contracts/{contract_id}/payments")
async def add_payment(contract_id: str, payload: PaymentCreate, user=Depends(get_current_user)):
    res = await _push_subitem(contract_id, "payments", payload.model_dump(), user, "payment",
                                f"Pago {payload.invoice}: {payload.amount} ({payload.status})")
    if payload.status == "paid":
        await db.contracts.update_one({"contract_id": contract_id},
            {"$inc": {"executed_value": payload.amount}})
        res = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
        return doc_clean(res)
    return res


@api.post("/contracts/{contract_id}/esf")
async def add_esf(contract_id: str, payload: ESFItemCreate, user=Depends(get_current_user)):
    return await _push_subitem(contract_id, "esf_items", payload.model_dump(), user, "esf",
                                f"ESF: {payload.requirement[:60]} - {'OK' if payload.compliant else 'PENDIENTE'}")


# ---------- Evidence ----------
@api.post("/evidence")
async def create_evidence(payload: EvidenceCreate, user=Depends(get_current_user)):
    c = await db.contracts.find_one({"contract_id": payload.contract_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contract not found")
    eid = f"ev_{uuid.uuid4().hex[:10]}"
    ev = {"evidence_id": eid, "contract_id": payload.contract_id,
          "milestone_name": payload.milestone_name, "note": payload.note or "",
          "image_base64": payload.image_base64,
          "latitude": payload.latitude, "longitude": payload.longitude,
          "accuracy_m": payload.accuracy_m,
          "captured_by_id": user["user_id"], "captured_by_name": user["name"],
          "captured_at": now_utc(), "immutable_hash": uuid.uuid4().hex}
    await db.evidence.insert_one(ev.copy())
    gps = f"{payload.latitude:.4f},{payload.longitude:.4f}" if payload.latitude is not None and payload.longitude is not None else "—"
    await db.contracts.update_one({"contract_id": payload.contract_id},
        {"$push": {"timeline": {"id": uuid.uuid4().hex, "at": now_utc(),
            "actor_id": user["user_id"], "actor_name": user["name"], "kind": "evidence",
            "message": f"Evidence captured at {gps}"}}})
    out = {**ev, "image_base64": ev["image_base64"][:80] + "..."}
    return doc_clean(out)


@api.get("/evidence")
async def list_evidence(contract_id: Optional[str] = None, user=Depends(get_current_user)):
    q = {"contract_id": contract_id} if contract_id else {}
    items = [doc_clean(e) async for e in db.evidence.find(q, {"_id": 0}).sort("captured_at", -1).limit(200)]
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
    contracts = [c async for c in db.contracts.find({"parent_contract_id": None}, {"_id": 0})]
    for c in contracts:
        c["status"] = compute_status(c)
        c["risk_level"] = compute_risk(c)
    total = sum(float(c.get("total_value", 0) or 0) for c in contracts)
    executed = sum(float(c.get("executed_value", 0) or 0) for c in contracts)
    retention = sum(float(c.get("retention_value", 0) or 0) for c in contracts)
    penalties = sum(float(c.get("penalty_value", 0) or 0) for c in contracts)
    active = sum(1 for c in contracts if c["status"] in ("signed", "active", "expiring"))
    in_review = sum(1 for c in contracts if c["status"] in ("draft", "in_review", "approved"))

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
        if days < 0 or days > 60:
            continue
        level = "high" if days <= 7 else ("medium" if days <= 30 else "low")
        alerts.append({"contract_id": c["contract_id"], "title": c["title"],
                       "counterparty": c.get("counterparty"), "days_to_end": days,
                       "level": level, "value": c.get("total_value"),
                       "currency": c.get("currency", "USD"), "end_date": iso(end),
                       "category": c.get("category")})
    alerts.sort(key=lambda x: x["days_to_end"])

    # By category aggregation
    by_category = {}
    for c in contracts:
        k = c.get("category", "bienes")
        by_category.setdefault(k, {"count": 0, "value": 0})
        by_category[k]["count"] += 1
        by_category[k]["value"] += float(c.get("total_value", 0) or 0)

    return {
        "kpis": {"total_value": total, "executed": executed, "retention": retention,
                 "penalties": penalties, "active": active, "in_review": in_review,
                 "total_contracts": len(contracts)},
        "alerts": alerts[:10],
        "recent": [doc_clean(c) for c in sorted(contracts, key=lambda x: x.get("updated_at") or x.get("created_at"), reverse=True)[:6]],
        "by_category": by_category,
    }


# ---------- AI ----------
SYSTEM_PROMPT = """You are CONEXIA AI Copilot, an enterprise contract analyst.
Analyze the contract text and return STRICT JSON with this exact schema (no markdown):
{
  "summary": "1-2 sentence executive summary",
  "key_dates": [{"label": "string", "date": "YYYY-MM-DD"}],
  "financial_obligations": [{"label": "string", "amount": number, "currency": "string", "due": "YYYY-MM-DD or null"}],
  "risk_clauses": [{"clause": "string", "severity": "low|medium|high", "reason": "string"}],
  "overall_risk": "low|medium|high"
}
Be concise. Empty arrays if nothing applies."""


@api.post("/ai/analyze")
async def ai_analyze(req: AIAnalyzeRequest, user=Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI key missing")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(500, f"AI lib unavailable: {e}")
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"a_{uuid.uuid4().hex[:8]}",
                   system_message=SYSTEM_PROMPT).with_model("anthropic", "claude-sonnet-4-6")
    msg = UserMessage(text=f"Analyze and return JSON:\n\n{req.contract_text}")
    try:
        resp = await chat.send_message(msg)
    except Exception as e:
        raise HTTPException(502, f"AI provider error: {e}")
    text = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
    import json
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
        payload = {"summary": text[:300], "key_dates": [], "financial_obligations": [],
                   "risk_clauses": [], "overall_risk": "low"}
    if req.contract_id:
        await db.contracts.update_one({"contract_id": req.contract_id},
            {"$set": {"ai_analysis": payload, "updated_at": now_utc()},
             "$push": {"timeline": {"id": uuid.uuid4().hex, "at": now_utc(),
                 "actor_id": user["user_id"], "actor_name": user["name"],
                 "kind": "ai_analysis", "message": "AI Copilot analyzed contract"}}})
    return payload


# ---------- Seed ----------
SAMPLES = [
    {"category": "obras", "title": "Construcción Planta Solar Norte", "counterparty": "Solaria Andina S.A.",
     "description": "EPC para 30MWp en Antofagasta", "total_value": 4_500_000,
     "days_to_end": 18, "executed": 1_800_000, "penalty": 35_000, "wf_all": True, "status": "active",
     "consultant": "Ing. Patricia Rojas", "product": "EPC Solar", "pay_pct": 40,
     "category_fields": {"physical_pct": 65, "financial_pct": 40, "change_orders": 2, "extensions_days": 15}},
    {"category": "servicios_no_consultoria", "title": "Servicio Mantención Subestación",
     "counterparty": "Energía Andes Ltda.", "description": "Mantención 24 meses",
     "total_value": 820_000, "days_to_end": 55, "executed": 410_000, "penalty": 0,
     "wf_all": True, "status": "signed",
     "consultant": "Carlos Mendieta", "product": "Mantención", "pay_pct": 50,
     "category_fields": {"service": "Mantención eléctrica preventiva", "incidents": 1}},
    {"category": "bienes", "title": "Suministro Equipos Mineros Fase II",
     "counterparty": "Minería del Pacífico", "description": "Logística equipos pesados",
     "total_value": 12_300_000, "days_to_end": 240, "executed": 0, "penalty": 0,
     "wf_all": False, "status": "in_review",
     "consultant": "Diego Ramírez", "product": "Equipos Pesados", "pay_pct": 0,
     "category_fields": {"warranty": "24 meses", "advance_pct": 0}},
    {"category": "consultor_individual", "title": "Consultoría Legal Internacional",
     "counterparty": "Baker Global LLP", "description": "Asesoría regulatoria eIDAS/UETA",
     "total_value": 180_000, "days_to_end": 5, "executed": 150_000, "penalty": 12_000,
     "wf_all": True, "status": "active",
     "consultant": "Dra. María Vargas", "product": "Asesoría legal", "pay_pct": 83,
     "category_fields": {"deliverable": "Informe regulatorio internacional"}},
    {"category": "firma_consultora", "title": "Auditoría Tecnológica Global",
     "counterparty": "TechAdvisory Group", "description": "Diagnóstico CLM + recomendaciones",
     "total_value": 540_000, "days_to_end": 95, "executed": 200_000, "penalty": 0,
     "wf_all": True, "status": "active",
     "consultant": "Ing. Felipe Soto", "product": "Auditoría TI", "pay_pct": 37,
     "category_fields": {"deliverable": "Diagnóstico + roadmap", "key_personnel": "F. Soto, A. Pérez"}},
    {"category": "acuerdo_marco", "title": "Marco Suministros IT Corporativo",
     "counterparty": "Conecta Tech SpA", "description": "Acuerdo marco 36 meses",
     "total_value": 3_000_000, "days_to_end": 600, "executed": 900_000, "penalty": 0,
     "wf_all": True, "status": "active",
     "consultant": "—", "product": "Acuerdo marco IT", "pay_pct": 30,
     "category_fields": {"max_amount": 3_000_000, "orders_issued": 14}},
]


@api.post("/seed")
async def seed_demo():
    user = await db.users.find_one({"email": "demo@conexia.io"})
    if not user:
        uid = f"user_{uuid.uuid4().hex[:12]}"
        user = {"user_id": uid, "email": "demo@conexia.io", "name": "Demo Director",
                "picture": None, "role": "direction", "department": "Executive",
                "auth_provider": "dev", "created_at": now_utc(), "locale": "es"}
        await db.users.insert_one(user)

    if await db.contracts.count_documents({}) > 0:
        return {"ok": True, "skipped": True}

    for i, s in enumerate(SAMPLES):
        start = now_utc() - timedelta(days=90)
        end = now_utc() + timedelta(days=s["days_to_end"])
        wf = default_workflow()
        if s["wf_all"]:
            for step in wf:
                step["status"] = "approved"; step["approver_name"] = "Demo Approver"
                step["decided_at"] = now_utc() - timedelta(days=60)
        else:
            wf[0]["status"] = "approved"; wf[0]["approver_name"] = "Demo Legal"
            wf[0]["decided_at"] = now_utc() - timedelta(days=10)
        cid = f"ctr_{uuid.uuid4().hex[:10]}"
        c = {
            "contract_id": cid, "title": s["title"], "counterparty": s["counterparty"],
            "description": s["description"], "total_value": s["total_value"], "currency": "USD",
            "start_date": start, "end_date": end, "status": s["status"], "workflow": wf,
            "executed_value": s["executed"], "retention_value": s["total_value"] * 0.05,
            "penalty_value": s["penalty"], "risk_level": "low", "parent_contract_id": None,
            "category": s["category"], "category_fields": s["category_fields"],
            "contract_number": f"CON-2026-{1001 + i:04d}",
            "consultant": s["consultant"], "product": s["product"],
            "scheduled_date": start + timedelta(days=30),
            "delivery_date": end, "pay_pct": s["pay_pct"],
            "observations": "Contrato seed para demostración",
            "department": "Operaciones", "owner_id": user["user_id"],
            "created_at": now_utc() - timedelta(days=90),
            "updated_at": now_utc() - timedelta(days=2),
            "risks": [{"id": uuid.uuid4().hex, "risk": "Atraso por permisos ambientales",
                       "probability": "medium", "impact": "high",
                       "mitigation": "Seguimiento semanal", "responsible": "PMO",
                       "status": "monitoring", "created_at": now_utc() - timedelta(days=30)}],
            "modifications": [],
            "payments": [{"id": uuid.uuid4().hex, "invoice": f"F-{1001 + i:05d}",
                          "date": now_utc() - timedelta(days=20),
                          "amount": s["executed"] / 2 if s["executed"] else 0,
                          "deliverable": "Hito 1", "status": "paid",
                          "created_at": now_utc() - timedelta(days=20)}] if s["executed"] else [],
            "esf_items": [{"id": uuid.uuid4().hex, "requirement": "Plan de manejo ambiental",
                           "compliant": True,
                           "verification_date": now_utc() - timedelta(days=15),
                           "observations": "Verificado por consultor ambiental",
                           "created_at": now_utc() - timedelta(days=15)}],
            "timeline": [{"id": uuid.uuid4().hex, "at": now_utc() - timedelta(days=90),
                          "actor_id": user["user_id"], "actor_name": user["name"],
                          "kind": "created", "message": "Contrato creado en sistema CONEXIA"}],
        }
        c["risk_level"] = compute_risk(c)
        await db.contracts.insert_one(c)
    return {"ok": True, "seeded": len(SAMPLES)}


@api.get("/")
async def root():
    return {"app": "Conexia CLM v2", "status": "ok"}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


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
    await db.contracts.create_index("category")
    await db.evidence.create_index("evidence_id", unique=True)
    await db.evidence.create_index("contract_id")
    log.info("Conexia CLM v2 ready.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
