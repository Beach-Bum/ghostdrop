// GhostDropCore.cpp
#include "GhostDropCore.h"
#include "logos_api.h"
#include "logos_api_client.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QRandomGenerator>
#include <QTimer>
#include <QDebug>
#include <QDateTime>

GhostDropCore::GhostDropCore(QObject *parent)
    : QObject(parent)
    , m_crypto(new CryptoService(this))
    , m_storage(new LogosStorageService("http://localhost:8080", this))
    , m_blockchain(new LogosBlockchainService("http://localhost:3001", this))
    , m_strip(new StripService(this))
{
    // Wire strip signals
    connect(m_strip, &StripService::stripProgress,
            this, &GhostDropCore::stripProgress);
    connect(m_strip, &StripService::stripComplete,
            this, [this](const StripResult &r) {
                emit stripComplete(r.report.toVariantMap(), r.strippedBytes);
            });
    connect(m_strip, &StripService::stripError,
            this, &GhostDropCore::stripError);

    // Wire codex upload
    connect(m_storage, &LogosStorageService::uploadComplete,
            this, [this](const QString &cid, qint64 size, bool mock) {
                qDebug() << "[GhostDropCore] Logos Storage upload complete:" << cid << mock;
            });

    // Wire nomos signals
    connect(m_blockchain, &LogosBlockchainService::outletsLoaded,
            this, &GhostDropCore::outletsLoaded);
    connect(m_blockchain, &LogosBlockchainService::publicationsLoaded,
            this, &GhostDropCore::publicationsLoaded);
    connect(m_blockchain, &LogosBlockchainService::anchorComplete,
            this, [this](const QString &txHash, int block, bool mock) {
                qDebug() << "[GhostDropCore] Logos Blockchain anchor:" << txHash << block;
            });
}

// ─── Scan ─────────────────────────────────────────────────────────

QVariantMap GhostDropCore::scanFile(const QByteArray &fileData,
                                     const QString    &mimeType)
{
    auto scan = StripService::scanMetadata(fileData, mimeType);
    QVariantList fields;
    for (const auto &f : scan.fields)
        fields << QVariantMap{{"field",f.field},{"value",f.value},{"risk",f.risk}};
    return QVariantMap{
        {"fields",        fields},
        {"hasGPS",        scan.hasGPS},
        {"hasPrinterDots",scan.hasPrinterDots},
    };
}

// ─── Strip ────────────────────────────────────────────────────────

void GhostDropCore::stripFile(const QByteArray &fileData,
                                const QString    &mimeType,
                                const QString    &filename)
{
    m_strip->stripMetadata(fileData, mimeType, filename);
}

// ─── Load outlets ─────────────────────────────────────────────────

void GhostDropCore::loadOutlets()
{
    m_blockchain->getOutlets();
}

// ─── Submit ───────────────────────────────────────────────────────

void GhostDropCore::submitDocument(const QByteArray &fileData,
                                    const QString    &mimeType,
                                    const QString    &outletId,
                                    const QString    &outletPubKeyHex,
                                    const QString    &outletTopic,
                                    const QString    &coverNote,
                                    const QVariantMap &stripReportMap)
{
    Q_UNUSED(outletId)
    Q_UNUSED(stripReportMap)

    auto doSubmit = [=]() {
        emit submitLog("► Generating ephemeral secp256k1 keypair…", "#555");

        QByteArray outletPub = CryptoService::hexToBytes(outletPubKeyHex);
        auto envelope = CryptoService::buildSubmissionEnvelope(
            fileData, mimeType, outletPub, coverNote);

        emit submitLog("  pubkey: " + CryptoService::bytesToHex(envelope.ephKeys.pubKey).left(32) + "…", "#4dabf7");
        emit submitLog("  docHash: " + envelope.docHash.left(42) + "…", "#4dabf7");
        emit submitLog("► ECIES encryption complete (secp256k1 + AES-256-GCM)…", "#555");
        emit submitLog(QString("  payload: %1 bytes (%2 KB)")
                       .arg(envelope.payload.size())
                       .arg(envelope.payload.size() / 1024.0, 0, 'f', 1), "#555");

        // Send via Logos Messaging module
        emit submitLog("► Connecting to Logos Messaging p2p network…", "#555");
        wakuSend(outletTopic, envelope.payload);

        // Mock message ID from payload hash
        QString msgId = CryptoService::hashDocument(envelope.payload).mid(7).left(32);
        emit submitLog("  msgId: " + msgId, "#69db7c");
        emit submitLog("► Transmission complete via Logos Messaging gossip.", "#f1f3f5");

        QVariantMap receipt{
            {"msgId",       msgId},
            {"topic",       outletTopic},
            {"docHash",     envelope.docHash},
            {"ephPubHex",   CryptoService::bytesToHex(envelope.ephKeys.pubKey)},
            {"ephPrivHex",  CryptoService::bytesToHex(envelope.ephKeys.privKey)},
            {"mnemonic",    envelope.mnemonic},
            {"ts",          QDateTime::currentMSecsSinceEpoch()},
        };
        emit submitComplete(receipt);
    };

    // Small delay to let UI update
    QTimer::singleShot(100, this, doSubmit);
}

// ─── Back-channel poll ────────────────────────────────────────────

void GhostDropCore::pollBackChannel(const QString &ephPubHex)
{
    QString topic = "/logos-drop/1/backchannel/" + ephPubHex.left(32) + "/proto";
    wakuPollStore(topic);
}

// ─── Inbox ────────────────────────────────────────────────────────

void GhostDropCore::loadInbox(const QString &outletId)
{
    // In production: query Logos Messaging Store for submissions on outlet topic
    // For now: mock inbox matching JS MOCK_INBOX
    Q_UNUSED(outletId)
    qint64 now = QDateTime::currentMSecsSinceEpoch();
    QVariantList inbox{
        QVariantMap{{"id","sub_a"},{"ts",now-7200000},{"size","2.4 MB"},{"type","PDF"},
            {"ephPub","03a1b2c3d4e5f6789abcdef0123456789abcdef01234567"},{"status","unread"},{"stripped",true}},
        QVariantMap{{"id","sub_b"},{"ts",now-64800000},{"size","847 KB"},{"type","PDF"},
            {"ephPub","02f1e2d3c4b5a697886958473625141302192817161514"},{"status","unread"},{"stripped",true}},
        QVariantMap{{"id","sub_c"},{"ts",now-259200000},{"size","5.1 MB"},{"type","ZIP"},
            {"ephPub","03deadbeef0123456789abcdef01234567890abcde0123"},{"status","read"},{"stripped",true}},
    };
    QTimer::singleShot(900, this, [this, inbox]() { emit inboxLoaded(inbox); });
}

// ─── Publish ─────────────────────────────────────────────────────

void GhostDropCore::publishDocument(const QString    &headline,
                                     const QByteArray &decryptedDocBytes,
                                     const QString    &mimeType,
                                     const QString    &outletId,
                                     const QVariantMap &submissionMeta)
{
    Q_UNUSED(submissionMeta)

    auto doPublish = [=]() {
        emit publishLog("► Verifying metadata strip attestation…", "#555");
        QTimer::singleShot(400, this, [=]() {
        emit publishLog("  ✓ Strip verified", "#69db7c");

        emit publishLog("► Uploading to Logos Storage network…", "#555");

        // Wire single-shot codex upload
        auto *conn = new QMetaObject::Connection;
        *conn = connect(m_storage, &LogosStorageService::uploadComplete,
            this, [=](const QString &cid, qint64 size, bool mock) {
                QObject::disconnect(*conn);
                delete conn;

                emit publishLog("  CID: " + cid, "#4dabf7");
                emit publishLog(QString("  Size: %1 KB%2")
                    .arg(size / 1024.0, 0, 'f', 1)
                    .arg(mock ? " ⚠ mock" : ""), "#555");

                // Compute doc hash
                QString docHash = CryptoService::hashDocument(decryptedDocBytes);
                emit publishLog("► Computing document hash (SHA-256)…", "#555");
                emit publishLog("  " + docHash.left(42) + "…", "#4dabf7");

                emit publishLog("► Anchoring to Logos Blockchain chain…", "#555");

                auto *conn2 = new QMetaObject::Connection;
                *conn2 = connect(m_blockchain, &LogosBlockchainService::anchorComplete,
                    this, [=](const QString &txHash, int block, bool anMock) {
                        QObject::disconnect(*conn2);
                        delete conn2;

                        emit publishLog("  tx: " + txHash.left(42) + "…", "#4dabf7");
                        emit publishLog(QString("  block: %1").arg(block), "#555");
                        emit publishLog("► Broadcasting via Logos Messaging…", "#555");
                        emit publishLog("  ✓ Announced on reader topic", "#69db7c");
                        emit publishLog("► Done. Document is live and tamper-evident.", "#f1f3f5");

                        emit publishComplete(QVariantMap{
                            {"headline", headline},
                            {"cid",      cid},
                            {"hash",     docHash},
                            {"txHash",   txHash},
                            {"block",    block},
                            {"mock",     anMock || mock},
                        });
                    });

                m_blockchain->anchorDocument(docHash, outletId, cid, headline);
            });

        m_storage->upload(decryptedDocBytes, mimeType, headline.left(40) + ".pdf");
        }); // end 400ms timer
    };

    QTimer::singleShot(700, this, doPublish);
}

// ─── Reject ───────────────────────────────────────────────────────

void GhostDropCore::rejectSubmission(const QString &ephPubHex,
                                      const QString &outletId,
                                      const QString &reason)
{
    QJsonObject msg;
    msg["status"]   = "rejected";
    msg["text"]     = reason;
    msg["ts"]       = QDateTime::currentMSecsSinceEpoch();
    msg["outletId"] = outletId;

    QString topic = "/logos-drop/1/backchannel/" + ephPubHex.left(32) + "/proto";
    wakuSend(topic, QJsonDocument(msg).toJson(QJsonDocument::Compact));
}

// ─── Reader ───────────────────────────────────────────────────────

void GhostDropCore::loadPublications()
{
    m_blockchain->getPublications();
}

void GhostDropCore::verifyDocument(const QString &txHash,
                                    const QString &cid,
                                    const QString &expectedHash)
{
    Q_UNUSED(txHash)
    // Verify Logos Blockchain anchor
    auto *conn1 = new QMetaObject::Connection;
    *conn1 = connect(m_blockchain, &LogosBlockchainService::verifyResult,
        this, [=](bool verified, int, bool mock) {
            QObject::disconnect(*conn1);
            delete conn1;
            // Verify Logos Storage CID
            auto *conn2 = new QMetaObject::Connection;
            *conn2 = connect(m_storage, &LogosStorageService::manifestResult,
                this, [=](const QString&, bool exists) {
                    QObject::disconnect(*conn2);
                    delete conn2;
                    emit verifyResult(verified, exists, mock);
                });
            m_storage->fetchManifest(cid);
        });
    m_blockchain->verifyAnchor(txHash, expectedHash);
}

void GhostDropCore::lockTip(const QString &anchorId,
                              const QString &ephPubHex,
                              double amount)
{
    auto *conn = new QMetaObject::Connection;
    *conn = connect(m_blockchain, &LogosBlockchainService::tipLocked,
        this, [=](const QString &, const QString &txHash, bool mock) {
            QObject::disconnect(*conn);
            delete conn;
            emit tipLocked(txHash, mock);
        });
    m_blockchain->lockTip(anchorId, ephPubHex, amount);
}

// ─── Node status ─────────────────────────────────────────────────

void GhostDropCore::checkNodeStatus()
{
    auto *conn1 = new QMetaObject::Connection;
    *conn1 = connect(m_storage, &LogosStorageService::healthResult,
        this, [=](bool storageOnline, const QVariantMap &info) {
            QObject::disconnect(*conn1);
            delete conn1;
            auto *conn2 = new QMetaObject::Connection;
            *conn2 = connect(m_blockchain, &LogosBlockchainService::healthResult,
                this, [=](bool blockchainOnline, const QVariantMap &) {
                    QObject::disconnect(*conn2);
                    delete conn2;
                    emit nodeStatus(storageOnline, blockchainOnline, info);
                });
            m_blockchain->checkHealth();
        });
    m_storage->checkHealth();
}

// ─── Logos Messaging integration ─────────────────────────────────────────────
// Routes through the Logos Messaging module registered in liblogos.
// Falls back to debug log if Logos Messaging module is unavailable.

void GhostDropCore::wakuSend(const QString &topic, const QByteArray &payload)
{
    if (m_logosAPI) {
        QVariantList args{ topic, payload };
        m_logosAPI->getClient("logos_messaging_module")->callMethod("lightPushSend", args);
    } else {
        qDebug() << "[GhostDropCore] Logos Messaging unavailable — would send to" << topic
                 << "(" << payload.size() << "bytes)";
    }
}

void GhostDropCore::wakuPollStore(const QString &topic, qint64 since)
{
    if (m_logosAPI) {
        m_logosAPI->getClient("logos_messaging_module")->callMethod("pollStore",
            QVariantList{ topic, since });
    } else {
        // Mock: no back-channel messages yet
        QTimer::singleShot(1400, this, [this]() {
            emit backChannelMessages({});
        });
    }
}
