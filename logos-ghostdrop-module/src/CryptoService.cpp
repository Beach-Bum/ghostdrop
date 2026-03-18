// CryptoService.cpp
#include "CryptoService.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QDebug>
#include <QDateTime>
#include <QRandomGenerator>

// OpenSSL headers
#include <openssl/ec.h>
#include <openssl/ecdh.h>
#include <openssl/evp.h>
#include <openssl/sha.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>
#include <openssl/obj_mac.h>
#include <openssl/bn.h>

// ─── Word list (mirrors crypto.js WORD_LIST exactly) ─────────────

const QStringList CryptoService::s_wordList = {
    "access","arctic","arrow","audit","basin","beacon","border","carbon",
    "cipher","codex","commit","delta","deploy","derive","domain","echo",
    "epoch","error","field","forge","ghost","grant","harbor","index",
    "kernel","layer","limit","logic","matrix","mirror","nomos","orbit",
    "parse","phase","prime","proof","proxy","quorum","relay","route",
    "scope","seal","segment","signal","stake","state","store","stream",
    "token","trace","trust","vault","verify","waku","yield","zero",
    "anchor","bridge","chain","cipher","cloud","core","crypt","curve",
    "datum","edge","event","fiber","flag","flash","flow","frame",
    "gate","graph","grid","guard","hash","heap","hook","host",
    "input","ionic","iris","join","jump","keystone","leaf","lens",
    "link","loop","mesh","mode","mount","node","null","open",
    "pack","path","peer","pipe","pixel","plan","port","pulse",
    "query","queue","rack","ram","ring","root","rule","run",
    "salt","scan","seed","set","shard","shift","slab","slot",
    "snap","sort","span","spec","spin","split","stack","tag",
    "tap","task","term","test","text","thread","tick","tide",
    "tier","time","tip","tone","top","tree","trim","type",
    "unit","use","valve","view","void","wake","wall","wave",
    "web","wire","word","work","wrap","write","zone","zoom"
};

// ─── Constructor ──────────────────────────────────────────────────

CryptoService::CryptoService(QObject *parent) : QObject(parent) {}

// ─── Key Generation ───────────────────────────────────────────────

KeyPair CryptoService::generateKeyPair()
{
    KeyPair kp;
    EC_KEY *key = EC_KEY_new_by_curve_name(NID_secp256k1);
    EC_KEY_generate_key(key);

    // Private key — 32 bytes
    const BIGNUM *priv = EC_KEY_get0_private_key(key);
    kp.privKey.resize(32);
    BN_bn2binpad(priv, reinterpret_cast<unsigned char*>(kp.privKey.data()), 32);

    // Public key — compressed, 33 bytes
    const EC_POINT *pub = EC_KEY_get0_public_key(key);
    EC_GROUP *grp = EC_GROUP_new_by_curve_name(NID_secp256k1);
    size_t pubLen = EC_POINT_point2oct(
        grp, pub, POINT_CONVERSION_COMPRESSED,
        nullptr, 0, nullptr);
    kp.pubKey.resize(static_cast<int>(pubLen));
    EC_POINT_point2oct(
        grp, pub, POINT_CONVERSION_COMPRESSED,
        reinterpret_cast<unsigned char*>(kp.pubKey.data()), pubLen, nullptr);

    EC_GROUP_free(grp);
    EC_KEY_free(key);
    return kp;
}

// ─── Hex utilities ────────────────────────────────────────────────

QString CryptoService::bytesToHex(const QByteArray &bytes)
{
    return bytes.toHex();
}

QByteArray CryptoService::hexToBytes(const QString &hex)
{
    return QByteArray::fromHex(hex.toLatin1());
}

// ─── SHA-256 ──────────────────────────────────────────────────────

QString CryptoService::hashDocument(const QByteArray &data)
{
    unsigned char digest[SHA256_DIGEST_LENGTH];
    SHA256(reinterpret_cast<const unsigned char*>(data.constData()),
           static_cast<size_t>(data.size()), digest);
    QByteArray hash(reinterpret_cast<const char*>(digest), SHA256_DIGEST_LENGTH);
    return "sha256:" + bytesToHex(hash);
}

// ─── HKDF-SHA256 ─────────────────────────────────────────────────
// Matches @noble/hashes hkdf(sha256, ikm, undefined, info, outputLen)

QByteArray CryptoService::hkdf(const QByteArray &ikm,
                                 const QString    &info,
                                 int               outputLen)
{
    // HKDF-Extract with zero-length salt
    unsigned char prk[SHA256_DIGEST_LENGTH];
    unsigned int prkLen = SHA256_DIGEST_LENGTH;
    QByteArray salt(SHA256_DIGEST_LENGTH, '\0');
    HMAC(EVP_sha256(),
         salt.constData(), salt.size(),
         reinterpret_cast<const unsigned char*>(ikm.constData()), ikm.size(),
         prk, &prkLen);

    // HKDF-Expand
    QByteArray result;
    QByteArray infoBytes = info.toUtf8();
    unsigned char t[SHA256_DIGEST_LENGTH];
    unsigned int tLen = 0;
    unsigned char counter = 1;
    QByteArray prev;

    while (result.size() < outputLen) {
        HMAC_CTX *ctx = HMAC_CTX_new();
        HMAC_Init_ex(ctx, prk, SHA256_DIGEST_LENGTH, EVP_sha256(), nullptr);
        if (!prev.isEmpty())
            HMAC_Update(ctx, reinterpret_cast<const unsigned char*>(prev.constData()), prev.size());
        HMAC_Update(ctx, reinterpret_cast<const unsigned char*>(infoBytes.constData()), infoBytes.size());
        HMAC_Update(ctx, &counter, 1);
        HMAC_Final(ctx, t, &tLen);
        HMAC_CTX_free(ctx);

        prev = QByteArray(reinterpret_cast<const char*>(t), SHA256_DIGEST_LENGTH);
        result.append(prev);
        counter++;
    }

    return result.left(outputLen);
}

// ─── AES-256-GCM ─────────────────────────────────────────────────

QByteArray CryptoService::aesGcmEncrypt(const QByteArray &key,
                                          const QByteArray &nonce,
                                          const QByteArray &plaintext)
{
    EVP_CIPHER_CTX *ctx = EVP_CIPHER_CTX_new();
    EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr);
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, nonce.size(), nullptr);
    EVP_EncryptInit_ex(ctx, nullptr, nullptr,
        reinterpret_cast<const unsigned char*>(key.constData()),
        reinterpret_cast<const unsigned char*>(nonce.constData()));

    QByteArray ciphertext(plaintext.size() + 16, '\0');
    int outLen = 0, finalLen = 0;

    EVP_EncryptUpdate(ctx,
        reinterpret_cast<unsigned char*>(ciphertext.data()), &outLen,
        reinterpret_cast<const unsigned char*>(plaintext.constData()), plaintext.size());

    EVP_EncryptFinal_ex(ctx,
        reinterpret_cast<unsigned char*>(ciphertext.data()) + outLen, &finalLen);

    // Append 16-byte GCM tag
    unsigned char tag[16];
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, 16, tag);
    EVP_CIPHER_CTX_free(ctx);

    ciphertext.resize(outLen + finalLen);
    ciphertext.append(reinterpret_cast<const char*>(tag), 16);
    return ciphertext;
}

QByteArray CryptoService::aesGcmDecrypt(const QByteArray &key,
                                          const QByteArray &nonce,
                                          const QByteArray &ciphertext)
{
    // Last 16 bytes are the GCM tag
    QByteArray ct   = ciphertext.left(ciphertext.size() - 16);
    QByteArray tag  = ciphertext.right(16);

    EVP_CIPHER_CTX *ctx = EVP_CIPHER_CTX_new();
    EVP_DecryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr);
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, nonce.size(), nullptr);
    EVP_DecryptInit_ex(ctx, nullptr, nullptr,
        reinterpret_cast<const unsigned char*>(key.constData()),
        reinterpret_cast<const unsigned char*>(nonce.constData()));

    QByteArray plaintext(ct.size(), '\0');
    int outLen = 0, finalLen = 0;

    EVP_DecryptUpdate(ctx,
        reinterpret_cast<unsigned char*>(plaintext.data()), &outLen,
        reinterpret_cast<const unsigned char*>(ct.constData()), ct.size());

    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_TAG, 16,
        const_cast<char*>(tag.constData()));

    int ok = EVP_DecryptFinal_ex(ctx,
        reinterpret_cast<unsigned char*>(plaintext.data()) + outLen, &finalLen);
    EVP_CIPHER_CTX_free(ctx);

    if (ok <= 0) {
        qWarning() << "CryptoService: AES-GCM tag verification failed";
        return QByteArray();
    }

    plaintext.resize(outLen + finalLen);
    return plaintext;
}

// ─── ECIES Encrypt ────────────────────────────────────────────────
// Wire format: [ephPub(33)][nonce(12)][ciphertext+tag(n+16)]
// Matches eciesEncrypt() in crypto.js exactly.

QByteArray CryptoService::eciesEncrypt(const QByteArray &plaintext,
                                         const QByteArray &recipientPubKey)
{
    // 1. Ephemeral keypair
    KeyPair eph = generateKeyPair();

    // 2. ECDH: sharedPoint = eph.privKey * recipientPubKey
    EC_GROUP *grp = EC_GROUP_new_by_curve_name(NID_secp256k1);
    EC_POINT *recvPub = EC_POINT_new(grp);
    EC_POINT_oct2point(grp, recvPub,
        reinterpret_cast<const unsigned char*>(recipientPubKey.constData()),
        recipientPubKey.size(), nullptr);

    BIGNUM *priv = BN_new();
    BN_bin2bn(reinterpret_cast<const unsigned char*>(eph.privKey.constData()),
              eph.privKey.size(), priv);

    EC_POINT *sharedPoint = EC_POINT_new(grp);
    EC_POINT_mul(grp, sharedPoint, nullptr, recvPub, priv, nullptr);

    // Serialize shared point (uncompressed, 65 bytes), take x-coordinate (bytes 1..33)
    QByteArray sharedFull(65, '\0');
    EC_POINT_point2oct(grp, sharedPoint, POINT_CONVERSION_UNCOMPRESSED,
        reinterpret_cast<unsigned char*>(sharedFull.data()), 65, nullptr);
    QByteArray sharedX = sharedFull.mid(1, 32); // x-coordinate only, matches JS slice(1)

    EC_POINT_free(sharedPoint);
    EC_POINT_free(recvPub);
    BN_free(priv);
    EC_GROUP_free(grp);

    // 3. HKDF-SHA256: derive 32-byte AES key
    QByteArray aesKey = hkdf(sharedX, "logos-drop-v1", 32);

    // 4. Random 12-byte nonce
    QByteArray nonce(12, '\0');
    RAND_bytes(reinterpret_cast<unsigned char*>(nonce.data()), 12);

    // 5. AES-256-GCM encrypt
    QByteArray ciphertext = aesGcmEncrypt(aesKey, nonce, plaintext);

    // 6. Wire format: ephPub(33) + nonce(12) + ciphertext+tag
    QByteArray out;
    out.append(eph.pubKey);   // 33 bytes
    out.append(nonce);        // 12 bytes
    out.append(ciphertext);   // n + 16 bytes
    return out;
}

// ─── ECIES Decrypt ────────────────────────────────────────────────

QByteArray CryptoService::eciesDecrypt(const QByteArray &payload,
                                         const QByteArray &recipientPrivKey)
{
    if (payload.size() < 33 + 12 + 16) {
        qWarning() << "CryptoService: payload too short for ECIES";
        return QByteArray();
    }

    QByteArray ephPub    = payload.left(33);
    QByteArray nonce     = payload.mid(33, 12);
    QByteArray ciphertext = payload.mid(45);

    // ECDH
    EC_GROUP *grp = EC_GROUP_new_by_curve_name(NID_secp256k1);
    EC_POINT *ephPoint = EC_POINT_new(grp);
    EC_POINT_oct2point(grp, ephPoint,
        reinterpret_cast<const unsigned char*>(ephPub.constData()),
        ephPub.size(), nullptr);

    BIGNUM *priv = BN_new();
    BN_bin2bn(reinterpret_cast<const unsigned char*>(recipientPrivKey.constData()),
              recipientPrivKey.size(), priv);

    EC_POINT *shared = EC_POINT_new(grp);
    EC_POINT_mul(grp, shared, nullptr, ephPoint, priv, nullptr);

    QByteArray sharedFull(65, '\0');
    EC_POINT_point2oct(grp, shared, POINT_CONVERSION_UNCOMPRESSED,
        reinterpret_cast<unsigned char*>(sharedFull.data()), 65, nullptr);
    QByteArray sharedX = sharedFull.mid(1, 32);

    EC_POINT_free(shared);
    EC_POINT_free(ephPoint);
    BN_free(priv);
    EC_GROUP_free(grp);

    QByteArray aesKey = hkdf(sharedX, "logos-drop-v1", 32);
    return aesGcmDecrypt(aesKey, nonce, ciphertext);
}

// ─── Mnemonic ─────────────────────────────────────────────────────
// Matches privKeyToMnemonic() in crypto.js

QString CryptoService::privKeyToMnemonic(const QByteArray &privKey)
{
    QStringList words;
    int n = s_wordList.size();
    for (int i = 0; i < 12; i++) {
        int byte = (static_cast<unsigned char>(privKey[i * 2]) ^
                    static_cast<unsigned char>(privKey[i * 2 + 1]));
        int idx = static_cast<int>((static_cast<double>(byte) / 256.0) * n);
        words << s_wordList[qBound(0, idx, n - 1)];
    }
    return words.join(" ");
}

// ─── Submission Envelope ─────────────────────────────────────────
// Matches buildSubmissionEnvelope() in crypto.js
// Plaintext = 4-byte length prefix + JSON envelope + raw doc bytes

SubmissionEnvelope CryptoService::buildSubmissionEnvelope(
    const QByteArray &docBytes,
    const QString    &mimeType,
    const QByteArray &outletPubKey,
    const QString    &coverNote)
{
    SubmissionEnvelope result;
    result.ephKeys = generateKeyPair();

    result.docHash = hashDocument(docBytes);

    QJsonObject envelope;
    envelope["version"]    = "logos-drop/1";
    envelope["ts"]         = QDateTime::currentMSecsSinceEpoch();
    envelope["docHash"]    = result.docHash;
    envelope["docSize"]    = docBytes.size();
    envelope["mimeType"]   = mimeType;
    envelope["ephPubHex"]  = bytesToHex(result.ephKeys.pubKey);
    envelope["coverNote"]  = coverNote;

    QByteArray envBytes = QJsonDocument(envelope).toJson(QJsonDocument::Compact);

    // 4-byte big-endian length prefix
    quint32 envLen = static_cast<quint32>(envBytes.size());
    QByteArray lenPrefix(4, '\0');
    lenPrefix[0] = (envLen >> 24) & 0xFF;
    lenPrefix[1] = (envLen >> 16) & 0xFF;
    lenPrefix[2] = (envLen >>  8) & 0xFF;
    lenPrefix[3] =  envLen        & 0xFF;

    QByteArray plaintext;
    plaintext.append(lenPrefix);
    plaintext.append(envBytes);
    plaintext.append(docBytes);

    result.payload  = eciesEncrypt(plaintext, outletPubKey);
    result.mnemonic = privKeyToMnemonic(result.ephKeys.privKey);
    return result;
}

// ─── Decode Submission ────────────────────────────────────────────

CryptoService::DecodedSubmission CryptoService::decodeSubmission(
    const QByteArray &payload,
    const QByteArray &outletPrivKey)
{
    DecodedSubmission result;
    QByteArray plaintext = eciesDecrypt(payload, outletPrivKey);
    if (plaintext.isEmpty()) return result;

    quint32 envLen = (static_cast<unsigned char>(plaintext[0]) << 24) |
                     (static_cast<unsigned char>(plaintext[1]) << 16) |
                     (static_cast<unsigned char>(plaintext[2]) <<  8) |
                      static_cast<unsigned char>(plaintext[3]);

    QByteArray envBytes = plaintext.mid(4, envLen);
    result.docBytes     = plaintext.mid(4 + envLen);

    QJsonDocument doc = QJsonDocument::fromJson(envBytes);
    if (doc.isObject()) {
        auto obj = doc.object();
        for (auto it = obj.begin(); it != obj.end(); ++it)
            result.envelope[it.key()] = it.value().toVariant();
    }
    return result;
}
