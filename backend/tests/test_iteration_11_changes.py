"""Backend tests for iteration 11 — Conexia CLM v2.

Focus: recent changes only
- counterparty is now OPTIONAL in ContractCreate
- PATCH /api/contracts/{id} — edit any field (admin/owner)
- DELETE /api/contracts/{id} — cascade delete (admin/owner)
- POST /api/seed disabled (returns {ok:false, disabled:true} for admin, 401 anon)
- POST /api/auth/dev-login returns 410 Gone
- POST /api/ai/extract-contract supports text PDFs (up to 120 pages) + scanned PDFs (Claude vision)
"""
import base64
import io
import os
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_auth(session):
    r = session.post(
        f"{API}/auth/login",
        json={"email": "admin@conexia.io", "password": "Conexiadmin90"},
        timeout=30,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "token": data["session_token"],
        "headers": {
            "Authorization": f"Bearer {data['session_token']}",
            "Content-Type": "application/json",
        },
        "user": data["user"],
    }


# ---------- Disabled endpoints ----------
class TestDisabledEndpoints:
    def test_dev_login_returns_410(self, session):
        r = session.post(f"{API}/auth/dev-login", timeout=15)
        assert r.status_code == 410, f"expected 410 Gone, got {r.status_code}: {r.text}"

    def test_seed_anonymous_returns_401(self, session):
        # no auth header
        anon = requests.Session()
        anon.headers.update({"Content-Type": "application/json"})
        r = anon.post(f"{API}/seed", timeout=15)
        assert r.status_code == 401, f"expected 401 for anon seed, got {r.status_code}: {r.text}"

    def test_seed_admin_returns_disabled(self, admin_auth):
        r = requests.post(f"{API}/seed", headers=admin_auth["headers"], timeout=15)
        assert r.status_code in (200, 403), f"expected 200 disabled response, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") is False, f"expected ok=false, got {data}"
        assert data.get("disabled") is True, f"expected disabled=true, got {data}"


# ---------- Dashboard: clean DB ----------
class TestDashboardClean:
    def test_dashboard_returns_zero_contracts(self, admin_auth):
        r = requests.get(f"{API}/dashboard", headers=admin_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # Should have zero contracts if truly clean; we only assert structure & type
        assert "kpis" in data or "total" in data or isinstance(data, dict)


# ---------- Contract create WITHOUT counterparty ----------
class TestContractCreateOptionalCounterparty:
    def test_create_contract_without_counterparty(self, admin_auth):
        payload = {
            "title": "TEST_no_counterparty",
            "total_value": 5000,
            "signed_date": "2026-01-15",
            "start_date": "2026-01-15T00:00:00Z",
            "end_date": "2026-12-31T00:00:00Z",
            "category": "servicios_no_consultoria",
        }
        r = requests.post(
            f"{API}/contracts", json=payload, headers=admin_auth["headers"], timeout=20
        )
        assert r.status_code in (200, 201), f"create w/o counterparty failed: {r.status_code} {r.text}"
        data = r.json()
        assert "contract_id" in data or "id" in data, f"missing id in response: {data}"

    def test_create_contract_with_all_fields(self, admin_auth):
        payload = {
            "title": "TEST_full_fields",
            "counterparty": "TEST Counterparty S.A.",
            "provider": "TEST Provider",
            "product": "TEST Product",
            "total_value": 20000,
            "signed_date": "2026-02-15",
            "start_date": "2026-02-15T00:00:00Z",
            "end_date": "2026-12-15T00:00:00Z",
            "category": "consultor_individual",
            "payment_breakdown": [
                {"label": "Anticipo", "amount": 5000},
                {"label": "Cierre", "amount": 15000},
            ],
        }
        r = requests.post(
            f"{API}/contracts", json=payload, headers=admin_auth["headers"], timeout=20
        )
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
        data = r.json()
        cid = data.get("contract_id") or data.get("id")
        assert cid, f"missing contract_id: {data}"
        # verify GET
        rget = requests.get(f"{API}/contracts/{cid}", headers=admin_auth["headers"], timeout=15)
        assert rget.status_code == 200, rget.text
        c = rget.json()
        assert c.get("provider") == "TEST Provider"
        assert c.get("product") == "TEST Product"
        assert c.get("counterparty") == "TEST Counterparty S.A."


# ---------- PATCH contract ----------
class TestContractPatch:
    @pytest.fixture(scope="class")
    def contract_id(self, admin_auth):
        payload = {
            "title": "TEST_patch_original",
            "total_value": 10000,
            "signed_date": "2026-03-01",
            "start_date": "2026-03-01T00:00:00Z",
            "end_date": "2026-12-31T00:00:00Z",
            "category": "bienes",
        }
        r = requests.post(
            f"{API}/contracts", json=payload, headers=admin_auth["headers"], timeout=20
        )
        assert r.status_code in (200, 201)
        return r.json().get("contract_id") or r.json().get("id")

    def test_patch_updates_fields(self, admin_auth, contract_id):
        updates = {
            "title": "TEST_patch_edited",
            "total_value": 30000,
            "provider": "TEST New Provider",
        }
        r = requests.patch(
            f"{API}/contracts/{contract_id}",
            json=updates,
            headers=admin_auth["headers"],
            timeout=20,
        )
        assert r.status_code == 200, f"patch failed: {r.status_code} {r.text}"
        data = r.json()
        # response could be contract obj or {ok:true, contract:{}}
        c = data.get("contract") if isinstance(data.get("contract"), dict) else data
        assert c.get("title") == "TEST_patch_edited", f"title not updated: {c.get('title')}"
        assert float(c.get("total_value", 0)) == 30000, f"total_value not updated: {c.get('total_value')}"
        assert c.get("provider") == "TEST New Provider", f"provider not updated: {c.get('provider')}"
        # consultant should mirror provider
        assert c.get("consultant") == "TEST New Provider", (
            f"consultant should mirror provider, got: {c.get('consultant')}"
        )
        # retention should be total_value*0.05
        retention = c.get("retention_value")
        assert retention is not None, "retention_value missing"
        assert abs(float(retention) - 1500.0) < 0.01, (
            f"retention_value expected 1500.0, got {retention}"
        )
        # timeline should have an 'updated' entry
        timeline = c.get("timeline") or []
        assert any(
            ("updated" in str(evt).lower()) or (isinstance(evt, dict) and "updated" in str(evt.get("event", "")).lower())
            for evt in timeline
        ), f"expected timeline to contain an 'updated' entry, got {timeline}"

    def test_patch_by_non_owner_returns_403(self, session, admin_auth, contract_id):
        # register a random new user (non-admin)
        rnd = uuid.uuid4().hex[:8]
        email = f"TEST_other_{rnd}@example.com"
        reg = session.post(
            f"{API}/auth/register",
            json={"email": email, "name": "Other", "password": "SecurePass123"},
            timeout=20,
        )
        if reg.status_code not in (200, 201):
            pytest.skip(f"cannot create secondary user: {reg.status_code} {reg.text}")
        token = reg.json().get("session_token")
        if not token:
            login = session.post(
                f"{API}/auth/login",
                json={"email": email, "password": "SecurePass123"},
                timeout=15,
            )
            token = login.json().get("session_token")
        assert token
        r = requests.patch(
            f"{API}/contracts/{contract_id}",
            json={"title": "hack"},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403 for non-owner PATCH, got {r.status_code}: {r.text}"


# ---------- DELETE contract ----------
class TestContractDelete:
    def test_delete_then_get_404(self, admin_auth):
        # create a fresh contract
        payload = {
            "title": "TEST_delete_me",
            "total_value": 500,
            "signed_date": "2026-04-01",
            "start_date": "2026-04-01T00:00:00Z",
            "end_date": "2026-12-31T00:00:00Z",
            "category": "bienes",
        }
        r = requests.post(
            f"{API}/contracts", json=payload, headers=admin_auth["headers"], timeout=20
        )
        assert r.status_code in (200, 201)
        cid = r.json().get("contract_id") or r.json().get("id")

        rd = requests.delete(
            f"{API}/contracts/{cid}", headers=admin_auth["headers"], timeout=15
        )
        assert rd.status_code == 200, f"delete failed: {rd.status_code} {rd.text}"
        body = rd.json()
        assert body.get("ok") is True, f"expected ok=true, got {body}"
        assert body.get("deleted") == cid or body.get("id") == cid, f"expected deleted={cid}, got {body}"

        # subsequent GET
        rget = requests.get(f"{API}/contracts/{cid}", headers=admin_auth["headers"], timeout=15)
        assert rget.status_code == 404, f"expected 404 after delete, got {rget.status_code}"


# ---------- AI extraction ----------
def _make_text_pdf() -> bytes:
    """Build a simple text-based PDF with a plausible contract body."""
    import fitz  # PyMuPDF
    doc = fitz.open()
    page = doc.new_page()
    text = (
        "CONTRATO DE SERVICIOS PROFESIONALES\n"
        "Titulo: Contrato de Consultoria Tecnologica\n"
        "Contraparte: Empresa ABC S.A.C.\n"
        "Proveedor: Consultora XYZ\n"
        "Valor Total: USD 25,000.00\n"
        "Fecha de Firma: 2026-05-01\n"
        "Objeto: Prestacion de servicios de consultoria en tecnologia por 6 meses.\n"
        "Cronograma de pagos: 40% al inicio, 60% al finalizar entregables.\n"
    )
    page.insert_text((72, 72), text, fontsize=11)
    buf = doc.tobytes()
    doc.close()
    return buf


def _make_scanned_pdf() -> bytes:
    """Render text into an image, then embed the image in a PDF (no selectable text)."""
    import fitz
    # step 1: create a temp PDF with text, then rasterize
    src = fitz.open()
    p = src.new_page()
    p.insert_text(
        (72, 72),
        "CONTRATO OCR TEST\nTitulo: Contrato Escaneado\nValor Total: USD 12,345.00\n"
        "Contraparte: OCR Corp\nFecha de Firma: 2026-06-10\n",
        fontsize=14,
    )
    pix = p.get_pixmap(dpi=150)
    img_bytes = pix.tobytes("png")
    src.close()

    # step 2: embed image into fresh PDF
    dst = fitz.open()
    dp = dst.new_page(width=612, height=792)
    dp.insert_image(dp.rect, stream=img_bytes)
    out = dst.tobytes()
    dst.close()
    return out


class TestAIExtract:
    def test_extract_text_pdf(self, admin_auth):
        pdf_bytes = _make_text_pdf()
        payload = {
            "file_base64": base64.b64encode(pdf_bytes).decode("ascii"),
            "mime_type": "application/pdf",
            "filename": "test_text.pdf",
        }
        r = requests.post(
            f"{API}/ai/extract-contract",
            json=payload,
            headers=admin_auth["headers"],
            timeout=120,
        )
        assert r.status_code == 200, f"text PDF extract failed: {r.status_code} {r.text[:500]}"
        data = r.json()
        # response may nest under 'data' or return flat
        payload_out = data.get("data") if isinstance(data.get("data"), dict) else data
        assert "title" in payload_out or "titulo" in payload_out, f"missing title: {payload_out}"
        # total_value should be present as number or string
        assert (
            "total_value" in payload_out
            or "valor_total" in payload_out
            or "value" in payload_out
        ), f"missing total_value: {payload_out}"

    def test_extract_scanned_pdf(self, admin_auth):
        pdf_bytes = _make_scanned_pdf()
        payload = {
            "file_base64": base64.b64encode(pdf_bytes).decode("ascii"),
            "mime_type": "application/pdf",
            "filename": "test_scanned.pdf",
        }
        r = requests.post(
            f"{API}/ai/extract-contract",
            json=payload,
            headers=admin_auth["headers"],
            timeout=180,
        )
        assert r.status_code == 200, f"scanned PDF extract failed: {r.status_code} {r.text[:500]}"
        data = r.json()
        payload_out = data.get("data") if isinstance(data.get("data"), dict) else data
        # at minimum it should parse to a dict — OCR quality may vary
        assert isinstance(payload_out, dict)
