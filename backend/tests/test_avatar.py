"""Iteration 7 — avatar upload endpoint + regression."""
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://contract-forge-35.preview.emergentagent.com").rstrip("/")

# 1x1 PNG
TINY_PNG_B64 = base64.b64encode(
    bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
        "0000000A49444154789C636000000002000148AFA4710000000049454E44AE426082"
    )
).decode()


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/dev-login", timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# -------- avatar endpoint --------
def test_avatar_no_auth_returns_401():
    r = requests.post(f"{BASE_URL}/api/auth/avatar", json={"image_base64": TINY_PNG_B64}, timeout=20)
    assert r.status_code == 401


def test_avatar_empty_body_returns_400(headers):
    r = requests.post(f"{BASE_URL}/api/auth/avatar", json={}, headers=headers, timeout=20)
    assert r.status_code == 400


def test_avatar_empty_string_returns_400(headers):
    r = requests.post(f"{BASE_URL}/api/auth/avatar", json={"image_base64": ""}, headers=headers, timeout=20)
    assert r.status_code == 400


def test_avatar_upload_success_returns_user_with_data_uri(headers):
    r = requests.post(f"{BASE_URL}/api/auth/avatar", json={"image_base64": TINY_PNG_B64}, headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    user = r.json()
    assert user.get("picture", "").startswith("data:image/")
    assert TINY_PNG_B64 in user["picture"]


def test_avatar_persists_across_me(headers):
    # upload again then GET /me
    r = requests.post(f"{BASE_URL}/api/auth/avatar", json={"image_base64": TINY_PNG_B64}, headers=headers, timeout=30)
    assert r.status_code == 200
    uploaded = r.json()["picture"]

    me = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=20)
    assert me.status_code == 200
    assert me.json().get("picture") == uploaded


def test_avatar_accepts_data_uri_passthrough(headers):
    data_uri = f"data:image/png;base64,{TINY_PNG_B64}"
    r = requests.post(f"{BASE_URL}/api/auth/avatar", json={"image_base64": data_uri}, headers=headers, timeout=30)
    assert r.status_code == 200
    # Server should NOT double-wrap as data:image/jpeg;base64,data:image/png;...
    pic = r.json()["picture"]
    assert pic.startswith("data:image/png") or pic == data_uri


# -------- regression: critical endpoints --------
def test_me_endpoint(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=20)
    assert r.status_code == 200
    assert "user_id" in r.json()


def test_locale_endpoint(headers):
    r = requests.post(f"{BASE_URL}/api/auth/locale", json={"locale": "en"}, headers=headers, timeout=20)
    assert r.status_code == 200
    assert r.json()["locale"] == "en"
    requests.post(f"{BASE_URL}/api/auth/locale", json={"locale": "es"}, headers=headers, timeout=20)


def test_dashboard(headers):
    r = requests.get(f"{BASE_URL}/api/dashboard", headers=headers, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "kpis" in body and "alerts" in body


def test_contracts_list(headers):
    r = requests.get(f"{BASE_URL}/api/contracts", headers=headers, timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_share_link_for_first_contract(headers):
    r = requests.get(f"{BASE_URL}/api/contracts", headers=headers, timeout=30)
    contracts = r.json()
    if not contracts:
        pytest.skip("no contracts seeded")
    cid = contracts[0]["contract_id"]
    s = requests.post(f"{BASE_URL}/api/contracts/{cid}/share-link", headers=headers, timeout=20)
    assert s.status_code == 200
    assert s.json()["contract_id"] == cid


def test_login_with_bad_credentials_returns_401():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                       json={"email": "nobody@example.com", "password": "wrongpass"}, timeout=20)
    assert r.status_code == 401


def test_register_short_password_returns_400():
    r = requests.post(f"{BASE_URL}/api/auth/register",
                       json={"email": "TEST_short@example.com", "name": "X", "password": "abc"}, timeout=20)
    assert r.status_code == 400
