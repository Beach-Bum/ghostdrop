#pragma once
// ghostdrop_module_interface.h

#include <QObject>
#include <QVariantMap>
#include <QVariantList>
#include "interface.h"  // logos-liblogos PluginInterface

#define GhostDropModuleInterface_iid "co.logos.GhostDropModuleInterface/1.0"

class GhostDropModuleInterface : public PluginInterface
{
public:
    virtual ~GhostDropModuleInterface() = default;

    Q_INVOKABLE virtual QVariantMap  scanFile(const QString &fileDataHex, const QString &mimeType) = 0;
    Q_INVOKABLE virtual void         stripFile(const QString &fileDataHex, const QString &mimeType, const QString &filename) = 0;
    Q_INVOKABLE virtual void         loadOutlets() = 0;
    Q_INVOKABLE virtual void         submitDocument(const QString &fileDataHex, const QString &mimeType,
                                                     const QString &outletId, const QString &outletPubKeyHex,
                                                     const QString &outletTopic, const QString &coverNote,
                                                     const QVariantMap &stripReport) = 0;
    Q_INVOKABLE virtual void         pollBackChannel(const QString &ephPubHex) = 0;
    Q_INVOKABLE virtual void         loadInbox(const QString &outletId) = 0;
    Q_INVOKABLE virtual void         publishDocument(const QString &headline, const QString &docDataHex,
                                                      const QString &mimeType, const QString &outletId,
                                                      const QVariantMap &meta) = 0;
    Q_INVOKABLE virtual void         rejectSubmission(const QString &ephPubHex, const QString &outletId,
                                                       const QString &reason) = 0;
    Q_INVOKABLE virtual void         loadPublications() = 0;
    Q_INVOKABLE virtual void         verifyDocument(const QString &txHash, const QString &cid,
                                                     const QString &expectedHash) = 0;
    Q_INVOKABLE virtual void         lockTip(const QString &anchorId, const QString &ephPubHex, double amount) = 0;
    Q_INVOKABLE virtual void         checkNodeStatus() = 0;
};

Q_DECLARE_INTERFACE(GhostDropModuleInterface, GhostDropModuleInterface_iid)
