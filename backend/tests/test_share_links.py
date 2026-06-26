"""Tests for iteration 6: contract public share links (POST /share-link, GET /share/{token})."""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://contract-forge-35.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth(session):
    session.post(f"{API}/seed", timeout=30)
    r = session.post(f"{API}/auth/dev-login", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["session_token"], "headers": {"Authorization": f"Bearer {data['session_token']}"}}


@pytest.fixture(scope="module")
def contract(session, auth):
    r = session.get(f"{API}/contracts", headers=auth["headers"], timeout=30)
    assert r.status_code == 200
    items = r.json()
    assert len(items) > 0, "no seeded contracts"
    return items[0]


# ---- POST /api/contracts/{id}/share-link ----
class TestCreateShareLink:
    def test_unauth_returns_401(self, session, contract):
        r = session.post(f"{API}/contracts/{contract['contract_id']}/share-link", timeout=20)
        assert r.status_code == 401, r.text

    def test_unknown_id_returns_404(self, session, auth):
        r = session.post(f"{API}/contracts/ctr_doesnotexist/share-link",
                         headers=auth["headers"], timeout=20)
        assert r.status_code == 404, r.text

    def test_success_returns_token(self, session, auth, contract):
        r = session.post(f"{API}/contracts/{contract['contract_id']}/share-link",
                         headers=auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("token", "expires_at", "contract_id", "title",
                  "contract_number", "counterparty"):
            assert k in body, f"missing field {k}"
        assert body["token"].startswith("sh_"), body["token"]
        assert body["contract_id"] == contract["contract_id"]
        assert body["title"] == contract["title"]
        assert body["counterparty"] == contract["counterparty"]
        # expires_at must be ~7 days ahead
        from datetime import datetime, timezone, timedelta
        exp = datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00"))
        delta = exp - datetime.now(timezone.utc)
        assert timedelta(days=6) < delta <= timedelta(days=7, minutes=5), f"expires_at delta={delta}"


# ---- GET /api/share/{token} ----
class TestPublicShare:
    def test_invalid_token_404(self, session):
        r = session.get(f"{API}/share/sh_invalid_token_xyz", timeout=20)
        assert r.status_code == 404, r.text

    def test_valid_token_returns_html_no_auth(self, session, auth, contract):
        # create a fresh link
        r = session.post(f"{API}/contracts/{contract['contract_id']}/share-link",
                         headers=auth["headers"], timeout=20)
        assert r.status_code == 200
        token = r.json()["token"]

        # call WITHOUT auth header
        bare = requests.Session()
        r2 = bare.get(f"{API}/share/{token}", timeout=20)
        assert r2.status_code == 200, r2.text
        assert "text/html" in r2.headers.get("content-type", "").lower()
        html = r2.text
        # Banner present
        assert "CONEXIA &middot; Documento compartido por" in html or \
               "CONEXIA · Documento compartido por" in html, "shared banner not in HTML"
        # Contract identifiers present
        assert contract["title"] in html
        assert contract["counterparty"] in html
        assert (contract.get("contract_number") or "") in html
