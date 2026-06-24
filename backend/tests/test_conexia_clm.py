"""Backend API tests for CONEXIA CLM v2 — multi-category contracts, email/password auth, sub-modules.

Covers iteration 3 review items:
- email/password register/login/locale
- seed v2 with 6 categories + sub-collections
- category filter on GET /api/contracts
- new common fields on contract detail
- POST risks/modifications/payments/esf endpoints
- sign rejection on non-approved contracts
- regression: dashboard, workflow, addenda, evidence, AI
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://contract-forge-35.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

CATEGORIES = {
    "bienes", "obras", "servicios_no_consultoria",
    "consultor_individual", "firma_consultora", "acuerdo_marco",
}


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth(session):
    # ensure seed (idempotent)
    session.post(f"{API}/seed", timeout=30)
    r = session.post(f"{API}/auth/dev-login", timeout=30)
    assert r.status_code == 200, f"dev-login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["session_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "user": data["user"]}


# ---------- Health & Seed ----------
class TestHealthSeed:
    def test_health_root(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_seed_v2_categories(self, session, auth):
        """Either seed reports 6 (fresh) or skipped — either way DB must contain 6 categories."""
        r = session.post(f"{API}/seed", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j.get("ok") is True
        # validate contracts now have all 6 categories present
        rc = session.get(f"{API}/contracts", headers=auth["headers"], timeout=20)
        assert rc.status_code == 200
        contracts = rc.json()
        cats = {c.get("category") for c in contracts}
        assert CATEGORIES.issubset(cats), f"Missing categories: {CATEGORIES - cats}"


# ---------- Auth: email/password ----------
class TestPasswordAuth:
    @pytest.fixture(scope="class")
    def new_user(self):
        suffix = uuid.uuid4().hex[:8]
        return {
            "email": f"test.user.{suffix}@conexiaqa.io",
            "name": "TEST User",
            "password": "secret123",
        }

    def test_register_success(self, session, new_user):
        r = session.post(f"{API}/auth/register", json=new_user, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "session_token" in d and d["session_token"]
        u = d["user"]
        assert u["email"] == new_user["email"]
        assert u["auth_provider"] == "password"
        assert "password_hash" not in u  # must never be returned
        assert u.get("locale") == "es"

    def test_register_duplicate_email_409(self, session, new_user):
        r = session.post(f"{API}/auth/register", json=new_user, timeout=15)
        assert r.status_code == 409

    def test_register_weak_password_400(self, session):
        r = session.post(f"{API}/auth/register", json={
            "email": f"weak.{uuid.uuid4().hex[:6]}@conexiaqa.io",
            "name": "Weak", "password": "abc",
        }, timeout=15)
        assert r.status_code == 400

    def test_login_success_and_invalid(self, session, new_user):
        r = session.post(f"{API}/auth/login", json={
            "email": new_user["email"], "password": new_user["password"],
        }, timeout=15)
        assert r.status_code == 200, r.text
        tok = r.json().get("session_token")
        assert tok
        # invalid password
        rbad = session.post(f"{API}/auth/login", json={
            "email": new_user["email"], "password": "wrongpass",
        }, timeout=15)
        assert rbad.status_code == 401
        # non-existent user
        rmissing = session.post(f"{API}/auth/login", json={
            "email": "nope@conexiaqa.io", "password": "secret123",
        }, timeout=15)
        assert rmissing.status_code == 401

    def test_locale_set_en(self, session, new_user):
        lr = session.post(f"{API}/auth/login", json={
            "email": new_user["email"], "password": new_user["password"],
        }, timeout=15)
        tok = lr.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}"}
        r = session.post(f"{API}/auth/locale", json={"locale": "en"}, headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"ok": True, "locale": "en"}
        # verify persisted via /auth/me
        me = session.get(f"{API}/auth/me", headers=h, timeout=15)
        assert me.status_code == 200
        assert me.json().get("locale") == "en"

    def test_locale_invalid_400(self, session, auth):
        r = session.post(f"{API}/auth/locale", json={"locale": "fr"},
                         headers=auth["headers"], timeout=15)
        assert r.status_code == 400


# ---------- Dev-login & token gate ----------
class TestDevAuth:
    def test_dev_login(self, session):
        r = session.post(f"{API}/auth/dev-login", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["session_token"].startswith("sess_")
        assert d["user"]["email"] == "demo@conexia.io"

    def test_me_without_token(self, session):
        r = session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_invalid_token(self, session):
        r = session.get(f"{API}/auth/me",
                        headers={"Authorization": "Bearer not_a_real_token"}, timeout=15)
        assert r.status_code == 401


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard_shape(self, session, auth):
        r = session.get(f"{API}/dashboard", headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        for key in ("kpis", "alerts", "recent", "by_category"):
            assert key in d, f"missing {key}"
        k = d["kpis"]
        for kk in ("total_value", "executed", "retention", "penalties",
                   "active", "in_review", "total_contracts"):
            assert kk in k
        assert k["total_contracts"] >= 6
        # by_category should have all 6 keys
        assert CATEGORIES.issubset(set(d["by_category"].keys()))
        for cat, agg in d["by_category"].items():
            assert "count" in agg and "value" in agg


# ---------- Contracts CRUD + category filter ----------
class TestContracts:
    def test_list_all(self, session, auth):
        r = session.get(f"{API}/contracts", headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 6
        for c in items:
            assert c.get("parent_contract_id") is None
            assert c.get("category") in CATEGORIES

    def test_filter_by_category_obras(self, session, auth):
        r = session.get(f"{API}/contracts", params={"category": "obras"},
                        headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for c in items:
            assert c["category"] == "obras"

    def test_get_contract_detail_has_new_fields(self, session, auth):
        items = session.get(f"{API}/contracts", headers=auth["headers"], timeout=20).json()
        cid = items[0]["contract_id"]
        r = session.get(f"{API}/contracts/{cid}", headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        for f in ("contract_number", "consultant", "product", "scheduled_date",
                  "delivery_date", "pay_pct", "observations", "category",
                  "risks", "modifications", "payments", "esf_items",
                  "addenda", "evidence_count", "timeline", "workflow"):
            assert f in d, f"missing field {f}"
        assert isinstance(d["risks"], list)
        assert isinstance(d["payments"], list)
        assert isinstance(d["esf_items"], list)
        assert isinstance(d["modifications"], list)

    def test_create_contract_with_category(self, session, auth):
        start = datetime.now(timezone.utc).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(days=120)).isoformat()
        payload = {
            "title": "TEST_Contract V2",
            "counterparty": "TEST CP",
            "description": "desc",
            "total_value": 100000.0,
            "currency": "USD",
            "start_date": start,
            "end_date": end,
            "category": "firma_consultora",
            "contract_number": "TEST-2026-0001",
            "consultant": "Test Consultant",
            "product": "Test Product",
            "pay_pct": 25,
            "observations": "test obs",
        }
        r = session.post(f"{API}/contracts", json=payload, headers=auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["category"] == "firma_consultora"
        assert c["contract_number"] == "TEST-2026-0001"
        assert c["consultant"] == "Test Consultant"
        assert c["pay_pct"] == 25
        assert c["retention_value"] == 5000.0
        assert c["status"] == "draft"
        return c


# ---------- Sub-modules + sign gating + workflow + addenda ----------
class TestLifecycleAndSubModules:
    @pytest.fixture(scope="class")
    def fresh(self, session, auth):
        start = datetime.now(timezone.utc).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(days=180)).isoformat()
        payload = {
            "title": "TEST_Lifecycle V2", "counterparty": "TEST CP",
            "description": "lifecycle", "total_value": 200000.0, "currency": "USD",
            "start_date": start, "end_date": end, "category": "obras",
            "contract_number": "TEST-LC-001", "consultant": "C", "product": "P",
            "pay_pct": 0, "observations": "",
        }
        r = session.post(f"{API}/contracts", json=payload, headers=auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        return r.json()

    def test_sign_rejects_non_approved_400(self, session, auth, fresh):
        # status is 'draft' here — must be rejected
        r = session.post(f"{API}/contracts/{fresh['contract_id']}/sign",
                         headers=auth["headers"], timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_add_risk(self, session, auth, fresh):
        cid = fresh["contract_id"]
        r = session.post(f"{API}/contracts/{cid}/risks", json={
            "risk": "TEST_Riesgo regulatorio",
            "probability": "high", "impact": "high",
            "mitigation": "Plan", "responsible": "Legal",
        }, headers=auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert any(x.get("risk") == "TEST_Riesgo regulatorio" for x in d["risks"])
        assert any(t["kind"] == "risk" for t in d["timeline"])

    def test_add_modification(self, session, auth, fresh):
        cid = fresh["contract_id"]
        r = session.post(f"{API}/contracts/{cid}/modifications", json={
            "type": "amendment",
            "date": datetime.now(timezone.utc).isoformat(),
            "amount": 1000.0, "days": 5, "justification": "TEST",
            "approval": "pending",
        }, headers=auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["modifications"]) >= 1
        assert any(t["kind"] == "modification" for t in d["timeline"])

    def test_add_payment_paid_increments_executed(self, session, auth, fresh):
        cid = fresh["contract_id"]
        # baseline executed
        before = session.get(f"{API}/contracts/{cid}", headers=auth["headers"], timeout=15).json()
        baseline = float(before.get("executed_value", 0) or 0)
        r = session.post(f"{API}/contracts/{cid}/payments", json={
            "invoice": "TEST-INV-001",
            "date": datetime.now(timezone.utc).isoformat(),
            "amount": 5000.0, "deliverable": "Hito 1", "status": "paid",
        }, headers=auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["executed_value"] == pytest.approx(baseline + 5000.0)
        assert any(p["invoice"] == "TEST-INV-001" for p in d["payments"])

    def test_add_payment_pending_does_not_increment(self, session, auth, fresh):
        cid = fresh["contract_id"]
        before = session.get(f"{API}/contracts/{cid}", headers=auth["headers"], timeout=15).json()
        baseline = float(before["executed_value"])
        r = session.post(f"{API}/contracts/{cid}/payments", json={
            "invoice": "TEST-INV-002",
            "date": datetime.now(timezone.utc).isoformat(),
            "amount": 9999.0, "deliverable": "x", "status": "pending",
        }, headers=auth["headers"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert float(d["executed_value"]) == pytest.approx(baseline)

    def test_add_esf(self, session, auth, fresh):
        cid = fresh["contract_id"]
        r = session.post(f"{API}/contracts/{cid}/esf", json={
            "requirement": "TEST_ESF safeguard",
            "compliant": True,
            "verification_date": datetime.now(timezone.utc).isoformat(),
            "observations": "OK",
        }, headers=auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert any(x["requirement"] == "TEST_ESF safeguard" for x in d["esf_items"])
        assert any(t["kind"] == "esf" for t in d["timeline"])

    def test_workflow_approval_then_sign(self, session, auth, fresh):
        cid = fresh["contract_id"]
        for step in ("legal", "finance", "operations", "direction"):
            r = session.post(f"{API}/contracts/{cid}/workflow", json={
                "step": step, "decision": "approved", "note": f"ok-{step}",
            }, headers=auth["headers"], timeout=15)
            assert r.status_code == 200, r.text
        # now status should be 'approved' — sign should work
        sr = session.post(f"{API}/contracts/{cid}/sign", headers=auth["headers"], timeout=15)
        assert sr.status_code == 200, sr.text
        d = sr.json()
        assert d["status"] == "signed"
        assert any(t["kind"] == "signed" for t in d["timeline"])

    def test_create_addendum(self, session, auth, fresh):
        cid = fresh["contract_id"]
        r = session.post(f"{API}/contracts/{cid}/addenda", json={
            "title": "TEST_Addendum V2", "description": "extend",
            "value_delta": 50000.0, "end_date_delta_days": 30,
        }, headers=auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["parent_contract_id"] == cid
        assert a["total_value"] == 250000.0


# ---------- Evidence regression ----------
class TestEvidence:
    def test_create_and_list_evidence(self, session, auth):
        items = session.get(f"{API}/contracts", headers=auth["headers"], timeout=15).json()
        cid = items[0]["contract_id"]
        r = session.post(f"{API}/evidence", json={
            "contract_id": cid, "milestone_name": "Hito",
            "note": "TEST evidence",
            "image_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            "latitude": -33.4489, "longitude": -70.6693, "accuracy_m": 8.5,
        }, headers=auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        ev = r.json()
        assert ev["evidence_id"] and ev["immutable_hash"]
        lst = session.get(f"{API}/evidence", params={"contract_id": cid},
                          headers=auth["headers"], timeout=15)
        assert lst.status_code == 200
        assert any(e["evidence_id"] == ev["evidence_id"] for e in lst.json())


# ---------- AI ----------
class TestAI:
    def test_ai_analyze(self, session, auth):
        text = ("CONTRATO DE OBRA: EPC planta solar 30MWp. Valor total USD 4,500,000. "
                "Inicio: 2025-01-15. Término: 2026-03-31. Multa por retraso: 0.5%/día tope 5%. "
                "Garantía 10%. Retención 5%.")
        r = session.post(f"{API}/ai/analyze", json={"contract_text": text},
                         headers=auth["headers"], timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("summary", "key_dates", "financial_obligations", "risk_clauses", "overall_risk"):
            assert k in d
        assert d["overall_risk"] in ("low", "medium", "high")
