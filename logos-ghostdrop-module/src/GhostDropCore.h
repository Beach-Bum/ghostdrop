#pragma once
// GhostDropCore.h
//
// Central C++ backend for GhostDrop.
// Owns CryptoService, NetworkService, StripService.
// Exposes Q_INVOKABLE methods called by the Logos kernel via LogosAPI IPC.
// Emits events that the QML UI receives via GhostDropBridge.

#include <QObject>
#include <QVariantMap>
#include <QVariantList>

#include "CryptoService.h"
#include "NetworkService.h"
#include "StripService.h"

class LogosAPI;

class GhostDropCore : public QObject
{
    Q_OBJECT
public:
    explicit GhostDropCore(QObject *parent = nullptr);
    ~GhostDropCore() override = default;

    void setLogosAPI(LogosAPI *api) { m_logosAPI = api; }

    // ─── Source flow ────────────────────────────────────────────

    // Step 1: Scan file for metadata (sync, fast)
    Q_INVOKABLE QVariantMap scanFile(const QByteArray &fileData,
                                      const QString    &mimeType);

    // Step 2: Strip metadata (async, emits stripProgress + stripComplete)
    Q_INVOKABLE void stripFile(const QByteArray &fileData,
                                const QString    &mimeType,
                                const QString    &filename = QString());

    // Step 3: Load registered outlets
    Q_INVOKABLE void loadOutlets();

    // Step 4: Encrypt + send via Logos Messaging
    Q_INVOKABLE void submitDocument(const QByteArray &fileData,
                                     const QString    &mimeType,
                                     const QString    &outletId,
                                     const QString    &outletPubKeyHex,
                                     const QString    &outletTopic,
                                     const QString    &coverNote,
                                     const QVariantMap &stripReportMap);

    // Receipt: poll back-channel for outlet responses
    Q_INVOKABLE void pollBackChannel(const QString &ephPubHex);

    // ─── Outlet flow ────────────────────────────────────────────

    Q_INVOKABLE void loadInbox(const QString &outletId);
    Q_INVOKABLE void publishDocument(const QString &headline,
                                      const QByteArray &decryptedDocBytes,
                                      const QString &mimeType,
                                      const QString &outletId,
                                      const QVariantMap &submissionMeta);
    Q_INVOKABLE void rejectSubmission(const QString &ephPubHex,
                                       const QString &outletId,
                                       const QString &reason);

    // ─── Reader flow ────────────────────────────────────────────

    Q_INVOKABLE void loadPublications();
    Q_INVOKABLE void verifyDocument(const QString &txHash,
                                     const QString &cid,
                                     const QString &expectedHash);
    Q_INVOKABLE void lockTip(const QString &anchorId,
                               const QString &ephPubHex,
                               double amount);

    // ─── Status ─────────────────────────────────────────────────

    Q_INVOKABLE void checkNodeStatus();

signals:
    // Strip
    void stripProgress(const QString &stage, int percent);
    void stripComplete(const QVariantMap &report, const QByteArray &strippedBytes);
    void stripError(const QString &error);

    // Outlets
    void outletsLoaded(const QVariantList &outlets);

    // Submit
    void submitLog(const QString &message, const QString &color);
    void submitComplete(const QVariantMap &receipt);
    void submitError(const QString &error);

    // Back-channel
    void backChannelMessages(const QVariantList &messages);

    // Inbox
    void inboxLoaded(const QVariantList &submissions);

    // Publish
    void publishLog(const QString &message, const QString &color);
    void publishComplete(const QVariantMap &record);
    void publishError(const QString &error);

    // Reader
    void publicationsLoaded(const QVariantList &publications);
    void verifyResult(bool nomosVerified, bool codexVerified, bool mock);
    void tipLocked(const QString &txHash, bool mock);

    // Node status
    void nodeStatus(bool storageOnline, bool blockchainOnline, const QVariantMap &info);

private:
    LogosAPI    *m_logosAPI  = nullptr;
    CryptoService *m_crypto;
    LogosStorageService  *m_storage;
    LogosBlockchainService  *m_blockchain;
    StripService  *m_strip;

    // Logos Messaging: calls through to the Logos Messaging module registered in liblogos
    void wakuSend(const QString &topic, const QByteArray &payload);
    void wakuPollStore(const QString &topic, qint64 since = 0);

    // Helper
    QString rHex(int n);
    QString genMnemonic();
};
