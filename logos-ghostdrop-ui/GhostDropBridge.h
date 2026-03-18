#pragma once
// GhostDropBridge.h
//
// Injected into QML as context property "ghostDrop".
// Translates QML calls → LogosAPI IPC calls to ghostdrop_module backend.
// Translates incoming Logos events → Qt signals → QML Connections{}.

#include <QObject>
#include <QVariantMap>
#include <QVariantList>
#include <QByteArray>
#include <QString>
#include <QClipboard>
#include <QGuiApplication>
#include <QDateTime>
#include <QFile>
#include <QMimeDatabase>

class LogosAPI;

class GhostDropBridge : public QObject
{
    Q_OBJECT

    // Stack status exposed as QML properties
    Q_PROPERTY(QString messagingStatus  READ messagingStatus  NOTIFY statusChanged)
    Q_PROPERTY(QString storageStatus READ storageStatus NOTIFY statusChanged)
    Q_PROPERTY(QString blockchainStatus READ blockchainStatus NOTIFY statusChanged)

public:
    explicit GhostDropBridge(LogosAPI *logosAPI, QObject *parent = nullptr);

    // Called by GhostDropUIComponent to route incoming Logos events here
    void handleEvent(const QString &eventName, const QVariantList &data);

    QString messagingStatus()  const { return m_messagingStatus; }
    QString storageStatus() const { return m_storageStatus; }
    QString blockchainStatus() const { return m_blockchainStatus; }

public slots:
    // ── File handling ────────────────────────────────────────────
    // Read a file from disk, return data as hex string
    Q_INVOKABLE void readFileFromPath(const QString &path);
    Q_INVOKABLE QString stringToHex(const QString &text);

    // ── Source flow ──────────────────────────────────────────────
    Q_INVOKABLE QVariantMap scanFile(const QString &fileDataHex, const QString &mimeType);
    Q_INVOKABLE void stripFile(const QString &fileDataHex, const QString &mimeType, const QString &filename);
    Q_INVOKABLE void loadOutlets();
    Q_INVOKABLE void submitDocument(const QString &fileDataHex, const QString &mimeType,
                                     const QString &outletId, const QString &outletPubKeyHex,
                                     const QString &outletTopic, const QString &coverNote,
                                     const QVariantMap &stripReport);
    Q_INVOKABLE void pollBackChannel(const QString &ephPubHex);

    // ── Outlet flow ──────────────────────────────────────────────
    Q_INVOKABLE void loadInbox(const QString &outletId);
    Q_INVOKABLE void publishDocument(const QString &headline, const QString &docDataHex,
                                      const QString &mimeType, const QString &outletId,
                                      const QVariantMap &meta);
    Q_INVOKABLE void rejectSubmission(const QString &ephPubHex, const QString &outletId,
                                       const QString &reason);

    // ── Reader flow ──────────────────────────────────────────────
    Q_INVOKABLE void loadPublications();
    Q_INVOKABLE void verifyDocument(const QString &txHash, const QString &cid,
                                     const QString &expectedHash);
    Q_INVOKABLE void lockTip(const QString &anchorId, const QString &ephPubHex, double amount);

    // ── Utilities ────────────────────────────────────────────────
    Q_INVOKABLE void copyToClipboard(const QString &text);
    Q_INVOKABLE QString fmtAgo(qint64 timestamp);
    Q_INVOKABLE void checkNodeStatus();

signals:
    // Strip
    void stripProgress(const QString &stage, int percent);
    void stripComplete(const QVariantMap &report, const QString &strippedHex);
    void stripError(const QString &error);

    // Outlets
    void outletsLoaded(const QVariantList &outlets);

    // Submit
    void submitLog(const QString &message, const QString &color);
    void submitComplete(const QVariantMap &receipt);
    void submitError(const QString &error);
    void backChannelMessages(const QVariantList &messages);

    // File reading
    void fileRead(const QString &hex, const QString &mimeType, const QString &fileName);

    // Outlet
    void inboxLoaded(const QVariantList &inbox);
    void publishLog(const QString &message, const QString &color);
    void publishComplete(const QVariantMap &record);
    void publishError(const QString &error);

    // Reader
    void publicationsLoaded(const QVariantList &publications);
    void verifyResult(bool nomosVerified, bool codexVerified, bool mock);
    void tipLocked(const QString &txHash, bool mock);

    // Status
    void statusChanged();

private:
    void callBackend(const QString &method, const QVariantList &args = {});

    LogosAPI *m_logosAPI;
    QString   m_messagingStatus  = "warn";
    QString   m_storageStatus = "warn";
    QString   m_blockchainStatus = "warn";

    static constexpr const char *kModule = "ghostdrop_module";
};
