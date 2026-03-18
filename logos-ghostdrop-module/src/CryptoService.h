#pragma once
// CryptoService.h
//
// Native C++ port of ghostdrop/src/services/crypto.js
//
// Implements:
//   - secp256k1 keypair generation
//   - ECIES: ECDH + HKDF-SHA256 + AES-256-GCM
//   - Wire format: [ephPub(33)][nonce(12)][ciphertext+tag(n+16)]
//   - Mnemonic derivation (same word list as JS)
//   - SHA-256 document hashing
//
// Depends on OpenSSL (libssl + libcrypto — bundled in LogosApp.app).
// Compatible wire format with the JS implementation — messages encrypted
// by the browser can be decrypted here and vice versa.

#include <QByteArray>
#include <QString>
#include <QObject>
#include <QPair>

struct KeyPair {
    QByteArray privKey;   // 32 bytes, raw secp256k1 scalar
    QByteArray pubKey;    // 33 bytes, compressed secp256k1 point
};

struct SubmissionEnvelope {
    QByteArray payload;   // ECIES ciphertext ready to send
    KeyPair    ephKeys;   // ephemeral keypair (privKey = claim key)
    QString    docHash;   // "sha256:<hex>"
    QString    mnemonic;  // 12-word claim key phrase
};

class CryptoService : public QObject
{
    Q_OBJECT
public:
    explicit CryptoService(QObject *parent = nullptr);

    // Generate a fresh secp256k1 keypair
    static KeyPair generateKeyPair();

    // ECIES encrypt: plaintext → wire payload
    // recipientPubKey is the outlet's 33-byte compressed pubkey
    static QByteArray eciesEncrypt(const QByteArray &plaintext,
                                    const QByteArray &recipientPubKey);

    // ECIES decrypt: wire payload → plaintext
    // recipientPrivKey is the outlet's 32-byte private key
    static QByteArray eciesDecrypt(const QByteArray &payload,
                                    const QByteArray &recipientPrivKey);

    // SHA-256 hash, returns "sha256:<hex>"
    static QString hashDocument(const QByteArray &data);

    // Convert raw SHA-256 bytes to hex string
    static QString bytesToHex(const QByteArray &bytes);
    static QByteArray hexToBytes(const QString &hex);

    // Derive 12-word mnemonic from privKey bytes (same word list as JS)
    static QString privKeyToMnemonic(const QByteArray &privKey);

    // Build full ECIES submission envelope
    // Matches buildSubmissionEnvelope() in crypto.js exactly
    static SubmissionEnvelope buildSubmissionEnvelope(
        const QByteArray &docBytes,
        const QString    &mimeType,
        const QByteArray &outletPubKey,
        const QString    &coverNote = QString());

    // Decode a received submission (outlet side)
    struct DecodedSubmission {
        QVariantMap envelope;   // JSON envelope fields
        QByteArray  docBytes;   // raw document bytes
    };
    static DecodedSubmission decodeSubmission(const QByteArray &payload,
                                               const QByteArray &outletPrivKey);

private:
    // HKDF-SHA256 — derives AES key from ECDH shared secret
    static QByteArray hkdf(const QByteArray &ikm,
                             const QString    &info,
                             int               outputLen);

    // AES-256-GCM encrypt/decrypt
    static QByteArray aesGcmEncrypt(const QByteArray &key,
                                     const QByteArray &nonce,
                                     const QByteArray &plaintext);
    static QByteArray aesGcmDecrypt(const QByteArray &key,
                                     const QByteArray &nonce,
                                     const QByteArray &ciphertext); // includes 16-byte tag

    static const QStringList s_wordList;
};
