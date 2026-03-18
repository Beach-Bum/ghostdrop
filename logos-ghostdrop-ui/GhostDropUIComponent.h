#pragma once
// GhostDropUIComponent.h

#include <IComponent.h>
#include <QObject>
#include <QWidget>

class LogosAPI;
class GhostDropBridge;

class GhostDropUIComponent : public QObject, public IComponent
{
    Q_OBJECT
    Q_INTERFACES(IComponent)
    Q_PLUGIN_METADATA(IID IComponent_iid FILE "metadata.json")

public:
    explicit GhostDropUIComponent(QObject *parent = nullptr);
    ~GhostDropUIComponent() override;

    QWidget *createWidget(LogosAPI *logosAPI = nullptr) override;
    void     destroyWidget(QWidget *widget)             override;
};
