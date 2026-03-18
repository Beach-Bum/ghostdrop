#pragma once
// NetworkService.h
//
// Qt HTTP client for Logos Storage (Logos Storage) and Logos Blockchain (Logos Blockchain) REST APIs.
// Ports codex.js and nomos.js to native Qt network calls.
// All methods are async — results delivered via Qt signals.

#include <QObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QVariantMap>
#include <QJsonObject>
#include <QJsonArray>

// ─── Logos Storage (Logos Storage) ────────────────────────────────────────

class LogosStorageService : public QObject
{
    Q_OBJECT
public:
    explicit LogosStorageService(const QString &nodeUrl = "http://localhost:8080",
                           QObject *parent = nullptr);

    // Check if local Logos Storage node is reachable
    void checkHealth();

    // Upload bytes, emits uploadComplete(cid, size, mock)
    void upload(const QByteArray &data,
                const QString &mimeType = "application/octet-stream",
                const QString &filename = QString());

    // Verify CID exists on network
    void fetchManifest(const QString &cid);

    bool isOnline() const { return m_online; }

signals:
    void healthResult(bool online, const QVariantMap &info);
    void uploadComplete(const QString &cid, qint64 size, bool mock);
    void uploadProgress(qint64 sent, qint64 total);
    void manifestResult(const QString &cid, bool exists);
    void error(const QString &message);

private slots:
    void onHealthReply(QNetworkReply *reply);
    void onUploadReply(QNetworkReply *reply);

private:
    QNetworkAccessManager *m_nam;
    QString m_nodeUrl;
    bool m_online = false;

    QString mockCid(const QByteArray &data);
    QString rHex(int n);
};

// ─── Logos Blockchain (Logos Blockchain) ─────────────────────────────────────

class LogosBlockchainService : public QObject
{
    Q_OBJECT
public:
    // Channel ID = sha256("logos-drop-v1") — deterministic, matches JS
    static const QString LOGOS_DROP_CHANNEL;

    explicit LogosBlockchainService(const QString &nodeUrl = "http://localhost:3001",
                           QObject *parent = nullptr);

    void checkHealth();

    // Anchor a document to the chain via mantle_tx inscription
    void anchorDocument(const QString &docHash,
                         const QString &outletId,
                         const QString &cid,
                         const QString &headline);

    // Verify an anchor tx
    void verifyAnchor(const QString &txHash, const QString &expectedDocHash);

    // Lock a tip as UTXO output
    void lockTip(const QString &anchorId,
                  const QString &ephPubHex,
                  double xmrAmount);

    // Get registered outlets
    void getOutlets();

    // Get published documents
    void getPublications();

    bool isOnline() const { return m_online; }

signals:
    void healthResult(bool online, const QVariantMap &info);
    void anchorComplete(const QString &txHash, int block, bool mock);
    void verifyResult(bool verified, int block, bool mock);
    void tipLocked(const QString &escrowId, const QString &txHash, bool mock);
    void outletsLoaded(const QVariantList &outlets);
    void publicationsLoaded(const QVariantList &publications);
    void error(const QString &message);

private:
    QNetworkAccessManager *m_nam;
    QString m_nodeUrl;
    bool m_online = false;
    int m_mockBlock = 847293;

    QNetworkReply *get(const QString &path);
    void post(const QString &path, const QJsonObject &body);
    QString rHex(int n);
    int nextMockBlock();

    // Mock data matching JS _OUTLETS and _PUBS
    static QVariantList mockOutlets();
    static QVariantList mockPublications();
};
