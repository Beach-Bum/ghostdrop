// GhostDropUIComponent.cpp
#include "GhostDropUIComponent.h"
#include "GhostDropBridge.h"

#include "logos_api.h"
#include "logos_api_client.h"

#include <QQuickWidget>
#include <QQmlContext>
#include <QVBoxLayout>
#include <QWidget>
#include <QUrl>
#include <QDebug>

GhostDropUIComponent::GhostDropUIComponent(QObject *parent)
    : QObject(parent)
{
    qDebug() << "GhostDropUIComponent: created";
}

GhostDropUIComponent::~GhostDropUIComponent()
{
    qDebug() << "GhostDropUIComponent: destroyed";
}

QWidget *GhostDropUIComponent::createWidget(LogosAPI *logosAPI)
{
    qDebug() << "GhostDropUIComponent: createWidget";

    // Container widget
    auto *container = new QWidget();
    container->setObjectName("GhostDropContainer");
    container->setStyleSheet("background: #25262b;");

    auto *layout = new QVBoxLayout(container);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(0);

    // QML engine + widget
    auto *quickWidget = new QQuickWidget(container);
    quickWidget->setResizeMode(QQuickWidget::SizeRootObjectToView);
    quickWidget->setAttribute(Qt::WA_AlwaysStackOnTop);
    quickWidget->setClearColor(QColor("#25262b"));

    // Create bridge and inject as "ghostDrop" context property
    auto *bridge = new GhostDropBridge(logosAPI, quickWidget);
    quickWidget->rootContext()->setContextProperty("ghostDrop", bridge);

    // Wire Logos events → bridge
    if (logosAPI) {
        logosAPI->getClient("ghostdrop_module")
            ->onEvent([bridge](const QString &eventName, const QVariantList &data) {
                bridge->handleEvent(eventName, data);
            });
    }

    // Load root QML
    quickWidget->setSource(QUrl("qrc:/ghostdrop/GhostDropRoot.qml"));

    if (quickWidget->status() == QQuickWidget::Error) {
        qWarning() << "GhostDropUIComponent: QML errors:";
        for (const auto &e : quickWidget->errors())
            qWarning() << "  " << e.toString();
    }

    layout->addWidget(quickWidget);
    return container;
}

void GhostDropUIComponent::destroyWidget(QWidget *widget)
{
    qDebug() << "GhostDropUIComponent: destroyWidget";
    delete widget;
}
