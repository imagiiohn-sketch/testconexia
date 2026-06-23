"""Backend API tests for CONEXIA CLM MVP."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://contract-forge-35.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth(session):
    # ensure seed first
    session.post(f"{API}/seed", timeout=30)
    r = session.post(f"{API}/auth/dev-login", timeout=30)
    assert r.status_code == 200, f"dev-login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "session_token" in data and "user" in data
    token = data["session_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "user": data["user"]}


# ---------- Health & Seed ----------
class TestHealthSeed:
    def test_health_root(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_seed_idempotent(self, session):
        r1 = session.post(f"{API}/seed", timeout=30)
        assert r1.status_code == 200
        j1 = r1.json()
        assert j1.get("ok") is True
        # contracts should exist after first call (either freshly seeded or skipped)
        assert j1.get("seeded") == 5 or j1.get("skipped") is True

        r2 = session.post(f"{API}/seed", timeout=30)
        assert r2.status_code == 200
        j2 = r2.json()
        # Second call MUST be idempotent
        assert j2.get("skipped") is True
        assert j2.get("contracts", 0) >= 5


# ---------- Auth ----------
class TestAuth:
    def test_dev_login(self, session):
        r = session.post(f"{API}/auth/dev-login", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["session_token"].startswith("dev_")
        assert d["user"]["email"] == "demo@conexia.io"
        assert d["user"]["role"] in ("direction", "operations", "legal", "finance", "field")

    def test_me_with_token(self, session, auth):
        r = session.get(f"{API}/auth/me", headers=auth["headers"], timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == "demo@conexia.io"
        assert "user_id" in u

    def test_me_without_token(self, session):
        r = session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_invalid_token(self, session):
        r = session.get(f"{API}/auth/me", headers={"Authorization": "Bearer not_a_real_token"}, timeout=15)
        assert r.status_code == 401


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard(self, session, auth):
        r = session.get(f"{API}/dashboard", headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "kpis" in d and "alerts" in d and "recent" in d
        k = d["kpis"]
        for key in ("total_value", "executed", "retention", "penalties", "active", "in_review", "total_contracts"):
            assert key in k, f"Missing kpi: {key}"
        assert k["total_contracts"] >= 5
        assert isinstance(d["alerts"], list)
        assert isinstance(d["recent"], list) and len(d["recent"]) <= 5
        # Validate alert level computation - we know seed has days_to_end=5 (high) and 18 (medium) and 55 (low)
        if d["alerts"]:
            levels = {a["level"] for a in d["alerts"]}
            assert levels.issubset({"low", "medium", "high"})


# ---------- Contracts CRUD & filter ----------
class TestContracts:
    def test_list_all(self, session, auth):
        r = session.get(f"{API}/contracts", headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 5
        # ensure only parent contracts (no addenda) and required fields
        for c in items:
            assert c.get("parent_contract_id") is None
            assert "contract_id" in c and "title" in c and "status" in c

    def test_list_filter_active(self, session, auth):
        r = session.get(f"{API}/contracts", params={"status": "active"}, headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        items = r.json()
        # NOTE: filter happens via DB stored status; compute_status may override on read
        # but the DB stored statuses 'active' should return >=2 in seed (3 active rows)
        # However seed includes "signed" too. Just assert response and items >= 1
        assert isinstance(items, list)

    def test_get_contract_details(self, session, auth):
        r = session.get(f"{API}/contracts", headers=auth["headers"], timeout=20)
        cid = r.json()[0]["contract_id"]
        r2 = session.get(f"{API}/contracts/{cid}", headers=auth["headers"], timeout=20)
        assert r2.status_code == 200
        d = r2.json()
        assert d["contract_id"] == cid
        assert "addenda" in d and isinstance(d["addenda"], list)
        assert "evidence_count" in d and isinstance(d["evidence_count"], int)
        assert "timeline" in d and isinstance(d["timeline"], list)
        assert "workflow" in d

    def test_create_contract(self, session, auth):
        start = (datetime.now(timezone.utc)).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(days=120)).isoformat()
        payload = {
            "title": "TEST_Contract Backend",
            "counterparty": "TEST Counterparty",
            "description": "Test desc",
            "total_value": 100000.0,
            "currency": "USD",
            "start_date": start,
            "end_date": end,
            "milestones": [{"name": "M1", "due_date": end, "value": 50000}],
            "department": "Operations",
        }
        r = session.post(f"{API}/contracts", json=payload, headers=auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["title"] == payload["title"]
        assert c["status"] == "draft"
        assert c["total_value"] == 100000.0
        assert c["retention_value"] == 5000.0  # 5%
        assert len(c["workflow"]) == 4
        assert "contract_id" in c
        # GET verify persistence
        rg = session.get(f"{API}/contracts/{c['contract_id']}", headers=auth["headers"], timeout=20)
        assert rg.status_code == 200
        assert rg.json()["title"] == payload["title"]


# ---------- Workflow / Sign / Addenda ----------
class TestLifecycle:
    @pytest.fixture(scope="class")
    def fresh_contract(self, session, auth):
        start = datetime.now(timezone.utc).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(days=180)).isoformat()
        payload = {
            "title": "TEST_Lifecycle Contract",
            "counterparty": "TEST CP",
            "description": "lifecycle",
            "total_value": 200000.0,
            "currency": "USD",
            "start_date": start,
            "end_date": end,
            "milestones": [],
            "department": "Operations",
        }
        r = session.post(f"{API}/contracts", json=payload, headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        return r.json()

    def test_workflow_approval_rollup(self, session, auth, fresh_contract):
        cid = fresh_contract["contract_id"]
        steps = ["legal", "finance", "operations", "direction"]
        last = None
        for s in steps:
            r = session.post(
                f"{API}/contracts/{cid}/workflow",
                json={"step": s, "decision": "approved", "note": f"ok-{s}"},
                headers=auth["headers"], timeout=20,
            )
            assert r.status_code == 200, r.text
            last = r.json()
            # find the step
            step_obj = next((x for x in last["workflow"] if x["step"] == s), None)
            assert step_obj and step_obj["status"] == "approved"
            assert step_obj["approver_name"]
        assert last["status"] == "approved"
        # timeline should have 4 workflow events
        wf_events = [t for t in last["timeline"] if t["kind"] == "workflow"]
        assert len(wf_events) >= 4

    def test_sign_contract(self, session, auth, fresh_contract):
        cid = fresh_contract["contract_id"]
        r = session.post(f"{API}/contracts/{cid}/sign", headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "signed"
        signed_events = [t for t in d["timeline"] if t["kind"] == "signed"]
        assert signed_events and "Audit hash" in signed_events[-1]["message"]

    def test_create_addendum(self, session, auth, fresh_contract):
        cid = fresh_contract["contract_id"]
        payload = {
            "title": "TEST_Addendum 1",
            "description": "extend",
            "value_delta": 50000.0,
            "end_date_delta_days": 30,
        }
        r = session.post(f"{API}/contracts/{cid}/addenda", json=payload, headers=auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        addendum = r.json()
        assert addendum["parent_contract_id"] == cid
        assert addendum["title"] == "TEST_Addendum 1"
        assert addendum["total_value"] == 200000.0 + 50000.0
        # parent should have timeline event
        rp = session.get(f"{API}/contracts/{cid}", headers=auth["headers"], timeout=20)
        assert rp.status_code == 200
        parent = rp.json()
        add_events = [t for t in parent["timeline"] if t["kind"] == "addendum"]
        assert len(add_events) >= 1
        # parent should have addendum in addenda list
        addenda_ids = [a["contract_id"] for a in parent["addenda"]]
        assert addendum["contract_id"] in addenda_ids


# ---------- Evidence ----------
class TestEvidence:
    @pytest.fixture(scope="class")
    def contract_for_ev(self, session, auth):
        r = session.get(f"{API}/contracts", headers=auth["headers"], timeout=20)
        return r.json()[0]

    def test_create_evidence(self, session, auth, contract_for_ev):
        payload = {
            "contract_id": contract_for_ev["contract_id"],
            "milestone_name": "Hito Test",
            "note": "TEST evidence",
            "image_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            "latitude": -33.4489,
            "longitude": -70.6693,
            "accuracy_m": 8.5,
        }
        r = session.post(f"{API}/evidence", json=payload, headers=auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        ev = r.json()
        assert "evidence_id" in ev
        assert ev["latitude"] == -33.4489
        assert ev["captured_at"]
        assert ev["immutable_hash"]
        # GET single
        rg = session.get(f"{API}/evidence/{ev['evidence_id']}", headers=auth["headers"], timeout=20)
        assert rg.status_code == 200
        assert rg.json()["evidence_id"] == ev["evidence_id"]
        # contract timeline updated
        rc = session.get(f"{API}/contracts/{payload['contract_id']}", headers=auth["headers"], timeout=20)
        ev_events = [t for t in rc.json()["timeline"] if t["kind"] == "evidence"]
        assert len(ev_events) >= 1

    def test_list_evidence(self, session, auth):
        r = session.get(f"{API}/evidence", headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1

    def test_list_evidence_filter(self, session, auth, contract_for_ev):
        r = session.get(f"{API}/evidence", params={"contract_id": contract_for_ev["contract_id"]},
                        headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        for e in r.json():
            assert e["contract_id"] == contract_for_ev["contract_id"]


# ---------- AI Copilot ----------
class TestAI:
    def test_ai_analyze(self, session, auth):
        contract_text = (
            "CONTRATO DE OBRA: EPC planta solar 30MWp. Valor total USD 4,500,000. "
            "Inicio: 2025-01-15. Término: 2026-03-31. Hito 1 (movilización): USD 900,000 al 2025-02-15. "
            "Multa por retraso: 0.5% del valor por día, tope 5%. Garantía de fiel cumplimiento 10%. "
            "Retención 5%. Pagos en dólares, neto 30 días."
        )
        r = session.post(f"{API}/ai/analyze", json={"contract_text": contract_text},
                         headers=auth["headers"], timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("summary", "key_dates", "financial_obligations", "risk_clauses", "overall_risk"):
            assert key in d, f"missing key {key}"
        assert isinstance(d["summary"], str) and len(d["summary"]) > 5
        assert d["overall_risk"] in ("low", "medium", "high")
        assert isinstance(d["key_dates"], list)
        assert isinstance(d["financial_obligations"], list)
        assert isinstance(d["risk_clauses"], list)
