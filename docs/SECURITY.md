# 🛡️ Security Protocol & Cryptography Guide

> **Maximum Isolation, Zero Trust.** Protection across every technical layer.

---

## 🛰️ Zero-Trust Design Philosophy

Even in a multi-tenant bot environment, security remains our absolute priority. We operate on a **"Decryption at Runtime"** model where private keys are never stored in plaintext and exist in an unencrypted state for the minimum time required to sign a transaction.

### 🛡️ Core Security Features
1. **Multi-Tenant Isolation:** User data and configurations are logically separated in the DB.
2. **Encrypted Storage:** Private keys are stored in the database as base64-encoded ciphertexts.
3. **Transient Memory:** Keys are only decrypted in the Worker process during the specific `TradeExecutor` or `PaymentService` signing phase.
4. **Immediate Cleanup:** Memory is zeroed (via reference clearing) as soon as the transaction is sent.

---

## 🔐 Cryptographic Specification: AES-256-GCM

The project utilizes the `AES-256-GCM` (Galois/Counter Mode) standard for all sensitive wallet data. This provides both **Confidentiality** (encryption) and **Integrity/Authenticity** (via Auth Tags).

### 🛠️ Implementation Details (`src/utils/encryption.js`)

| Component | Standard | Purpose |
| :--- | :--- | :--- |
| **Algorithm** | `aes-256-gcm` | Modern, high-performance authenticated encryption. |
| **IV (Vector)** | 16-byte random | Ensures identical keys produce different ciphertexts. |
| **Auth Tag** | 16-byte HMAC | Prevents "Bit-Flipping" or unauthorized ciphertext tampering. |
| **Key Derivation**| Env-provided Master | Master encryption key provided via `ENCRYPTION_KEY`. |

```javascript
// Decryption Flow (Conceptual)
const privateKey = encryption.decrypt({
    encryptedData: wallet.cipher,
    iv: wallet.iv,
    authTag: wallet.tag
});
const signer = new Wallet(privateKey, provider);
// ... sign transaction ...
signer = null; // Purged from memory reference
```

---

## 🚀 Infrastructure Protections

### 🔌 Environment Security
- Use `.env.local` or Docker Secrets for the `ENCRYPTION_KEY` and `ADMIN_PRIVATE_KEY`.
- Never commit environment files to version control.
- Access to the underlying Database and Redis is restricted to the internal Docker network.

### 🔌 Transaction Safety
- **Gas Hardening:** Built-in safeguards to prevent unintended large fee spends.
- **Slippage Bounds:** Hard-coded 0.1% to 100% ranges with 1% 2026 default.

---

## 🚨 Security Incident Response
If any vulnerability or leakage is suspected, the immediate protocol is:
1. Revoke the `ENCRYPTION_KEY` on the server.
2. Stop all running bot/worker containers.
3. Conduct a full audit of database access logs.

---

---

## 📈 Audit Registry

| Date | Type | Status | Findings |
| :--- | :--- | :--- | :--- |
| **2026-04-16** | Full Repo Scan | 🟢 PASS | No hardcoded keys, mnemonic strings, or leaked .env files found. |
| **2026-04-15** | Infrastructure | 🟢 PASS | AES-256-GCM integrity verified on VPS database. |

---

*Securing the assets of the future with 2026 standards.*
