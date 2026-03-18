#pragma once
// ghostdrop_module_plugin.h

#include <QObject>
#include <QJsonArray>
#include "ghostdrop_module_interface.h"
#include "logos_api.h"
#include "logos_api_client.h"
#include "src/GhostDropCore.h"

class GhostDropModulePlugin : public QObject, public GhostDropModuleInterface
{
    Q_OBJECT
    Q_PLUGIN_METADATA(IID GhostDropModuleInterface_iid FILE "metadata.json")
    Q_INTERFACES(GhostDropModuleInterface PluginInterface)

public:
    explicit GhostDropModulePlugin(QObject *parent = nullptr);
    ~GhostDropModulePlugin() override;

    // PluginInterface
    QString name()    const override { return "ghostdrop_module"; }
    QString version() const override { return "1.0.0"; }
    Q_INVOKABLE void initLogos(LogosAPI *logosAPI) override;

    // GhostDropModuleInterface — all Q_INVOKABLE so kernel can call by name
    Q_INVOKABLE QVariantMap  scanFile(const QString &fileDataHex, const QString &mimeType) override;
    Q_INVOKABLE void         stripFile(const QString &fileDataHex, const QString &mimeType, const QString &filename) override;
    Q_INVOKABLE void         loadOutlets() override;
    Q_INVOKABLE void         submitDocument(const QString &fileDataHex, const QString &mimeType,
                                             const QString &outletId, const QString &outletPubKeyHex,
                                             const QString &outletTopic, const QString &coverNote,
                                             const QVariantMap &stripReport) override;
    Q_INVOKABLE void         pollBackChannel(const QString &ephPubHex) override;
    Q_INVOKABLE void         loadInbox(const QString &outletId) override;
    Q_INVOKABLE void         publishDocument(const QString &headline, const QString &docDataHex,
                                              const QString &mimeType, const QString &outletId,
                                              const QVariantMap &meta) override;
    Q_INVOKABLE void         rejectSubmission(const QString &ephPubHex, const QString &outletId,
                                               const QString &reason) override;
    Q_INVOKABLE void         loadPublications() override;
    Q_INVOKABLE void         verifyDocument(const QString &txHash, const QString &cid,
                                             const QString &expectedHash) override;
    Q_INVOKABLE void         lockTip(const QString &anchorId, const QString &ephPubHex,
                                      double amount) override;
    Q_INVOKABLE void         checkNodeStatus() override;

signals:
    void eventResponse(const QString &eventName, const QVariantList &data);

private:
    void emitEvent(const QString &name, const QVariantList &data);
    LogosAPI       *m_logosAPI = nullptr;
    GhostDropCore  *m_core;
};
