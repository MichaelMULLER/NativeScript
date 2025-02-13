// Definitions.
import {
    AndroidActivityBackPressedEventData,
    AndroidActivityBundleEventData,
    AndroidActivityEventData,
    AndroidActivityNewIntentEventData,
    AndroidActivityRequestPermissionsEventData,
    AndroidActivityResultEventData,
    AndroidApplication as AndroidApplicationDefinition,
    ApplicationEventData,
    CssChangedEventData,
    OrientationChangedEventData
} from ".";

import {
    displayedEvent, hasListeners, livesync, lowMemoryEvent, notify, Observable, on,
    orientationChanged, orientationChangedEvent, setApplication, suspendEvent
} from "./application-common";

import { profile } from "../profiling";

// First reexport so that app module is initialized.
export * from "./application-common";

// Types.
import { NavigationEntry, View, AndroidActivityCallbacks } from "../ui/frame";

const ActivityCreated = "activityCreated";
const ActivityDestroyed = "activityDestroyed";
const ActivityStarted = "activityStarted";
const ActivityPaused = "activityPaused";
const ActivityResumed = "activityResumed";
const ActivityStopped = "activityStopped";
const SaveActivityState = "saveActivityState";
const ActivityResult = "activityResult";
const ActivityBackPressed = "activityBackPressed";
const ActivityNewIntent = "activityNewIntent";
const ActivityRequestPermissions = "activityRequestPermissions";

export class AndroidApplication extends Observable implements AndroidApplicationDefinition {
    public static activityCreatedEvent = ActivityCreated;
    public static activityDestroyedEvent = ActivityDestroyed;
    public static activityStartedEvent = ActivityStarted;
    public static activityPausedEvent = ActivityPaused;
    public static activityResumedEvent = ActivityResumed;
    public static activityStoppedEvent = ActivityStopped;
    public static saveActivityStateEvent = SaveActivityState;
    public static activityResultEvent = ActivityResult;
    public static activityBackPressedEvent = ActivityBackPressed;
    public static activityNewIntentEvent = ActivityNewIntent;
    public static activityRequestPermissionsEvent = ActivityRequestPermissions;

    private _orientation: "portrait" | "landscape" | "unknown";
    public paused: boolean;
    public nativeApp: android.app.Application;
    public context: android.content.Context;
    public foregroundActivity: androidx.appcompat.app.AppCompatActivity;
    public startActivity: androidx.appcompat.app.AppCompatActivity;
    public packageName: string;
    // we are using these property to store the callbacks to avoid early GC collection which would trigger MarkReachableObjects
    private callbacks: any = {};

    public init(nativeApp: android.app.Application) {
        if (this.nativeApp === nativeApp) {
            return;
        }

        if (this.nativeApp) {
            throw new Error("application.android already initialized.");
        }

        this.nativeApp = nativeApp;
        this.packageName = nativeApp.getPackageName();
        this.context = nativeApp.getApplicationContext();

        // we store those callbacks and add a function for clearing them later so that the objects will be eligable for GC
        this.callbacks.lifecycleCallbacks = initLifecycleCallbacks();
        this.callbacks.componentCallbacks = initComponentCallbacks();
        this.nativeApp.registerActivityLifecycleCallbacks(this.callbacks.lifecycleCallbacks);
        this.nativeApp.registerComponentCallbacks(this.callbacks.componentCallbacks);

        this._registerPendingReceivers();
    }

    private _registeredReceivers = {};
    private _pendingReceiverRegistrations = new Array<(context: android.content.Context) => void>();
    private _registerPendingReceivers() {
        this._pendingReceiverRegistrations.forEach(func => func(this.context));
        this._pendingReceiverRegistrations.length = 0;
    }

    get orientation(): "portrait" | "landscape" | "unknown" {
        if (!this._orientation) {
            const resources = this.context.getResources();
            const configuration = <android.content.res.Configuration>resources.getConfiguration();
            const orientation = configuration.orientation;

            this._orientation = getOrientationValue(orientation);
        }

        return this._orientation;
    }

    set orientation(value: "portrait" | "landscape" | "unknown") {
        this._orientation = value;
    }

    public registerBroadcastReceiver(intentFilter: string, onReceiveCallback: (context: android.content.Context, intent: android.content.Intent) => void) {
        ensureBroadCastReceiverClass();
        const that = this;
        const registerFunc = function (context: android.content.Context) {
            const receiver: android.content.BroadcastReceiver = new BroadcastReceiverClass(onReceiveCallback);
            context.registerReceiver(receiver, new android.content.IntentFilter(intentFilter));
            that._registeredReceivers[intentFilter] = receiver;
        };

        if (this.context) {
            registerFunc(this.context);
        }
        else {
            this._pendingReceiverRegistrations.push(registerFunc);
        }
    }

    public unregisterBroadcastReceiver(intentFilter: string) {
        const receiver = this._registeredReceivers[intentFilter];
        if (receiver) {
            this.context.unregisterReceiver(receiver);
            this._registeredReceivers[intentFilter] = undefined;
            delete this._registeredReceivers[intentFilter];
        }
    }
}
export interface AndroidApplication {
    on(eventNames: string, callback: (data: AndroidActivityEventData) => void, thisArg?: any);
    on(event: "activityCreated", callback: (args: AndroidActivityBundleEventData) => void, thisArg?: any);
    on(event: "activityDestroyed", callback: (args: AndroidActivityEventData) => void, thisArg?: any);
    on(event: "activityStarted", callback: (args: AndroidActivityEventData) => void, thisArg?: any);
    on(event: "activityPaused", callback: (args: AndroidActivityEventData) => void, thisArg?: any);
    on(event: "activityResumed", callback: (args: AndroidActivityEventData) => void, thisArg?: any);
    on(event: "activityStopped", callback: (args: AndroidActivityEventData) => void, thisArg?: any);
    on(event: "saveActivityState", callback: (args: AndroidActivityBundleEventData) => void, thisArg?: any);
    on(event: "activityResult", callback: (args: AndroidActivityResultEventData) => void, thisArg?: any);
    on(event: "activityBackPressed", callback: (args: AndroidActivityBackPressedEventData) => void, thisArg?: any);
    on(event: "activityNewIntent", callback: (args: AndroidActivityNewIntentEventData) => void, thisArg?: any);
    on(event: "activityRequestPermissions", callback: (args: AndroidActivityRequestPermissionsEventData) => void, thisArg?: any);
}

const androidApp = new AndroidApplication();
export { androidApp as android };

setApplication(androidApp);

let mainEntry: NavigationEntry;
let started = false;
const createRootFrame = { value: true };

export function _start(entry?: NavigationEntry | string) {
    if (started) {
        throw new Error("Application is already started.");
    }

    started = true;
    mainEntry = typeof entry === "string" ? { moduleName: entry } : entry;
    if (!androidApp.nativeApp) {
        const nativeApp = getNativeApplication();
        androidApp.init(nativeApp);
    }
}

export function _shouldCreateRootFrame(): boolean {
    return createRootFrame.value;
}

export function run(entry?: NavigationEntry | string) {
    createRootFrame.value = false;
    _start(entry);
}

export function addCss(cssText: string): void {
    notify(<CssChangedEventData>{ eventName: "cssChanged", object: androidApp, cssText: cssText });
    const rootView = getRootView();
    if (rootView) {
        rootView._onCssStateChange();
    }
}

const CALLBACKS = "_callbacks";

export function _resetRootView(entry?: NavigationEntry | string) {
    const activity = androidApp.foregroundActivity;
    if (!activity) {
        throw new Error("Cannot find android activity.");
    }

    createRootFrame.value = false;
    mainEntry = typeof entry === "string" ? { moduleName: entry } : entry;
    const callbacks: AndroidActivityCallbacks = activity[CALLBACKS];
    if (!callbacks) {
        throw new Error("Cannot find android activity callbacks.");
    }
    callbacks.resetActivityContent(activity);
}

export function getMainEntry() {
    return mainEntry;
}

export function getRootView(): View {
    // Use start activity as a backup when foregroundActivity is still not set
    // in cases when we are getting the root view before activity.onResumed event is fired
    const activity = androidApp.foregroundActivity || androidApp.startActivity;
    if (!activity) {
        return undefined;
    }
    const callbacks: AndroidActivityCallbacks = activity[CALLBACKS];

    return callbacks ? callbacks.getRootView() : undefined;
}

export function getNativeApplication(): android.app.Application {
    // Try getting it from module - check whether application.android.init has been explicitly called
    let nativeApp = androidApp.nativeApp;
    if (!nativeApp) {
        // check whether the com.tns.NativeScriptApplication type exists
        if (!nativeApp && com.tns.NativeScriptApplication) {
            nativeApp = com.tns.NativeScriptApplication.getInstance();
        }

        // the getInstance might return null if com.tns.NativeScriptApplication exists but is  not the starting app type
        if (!nativeApp) {
            // TODO: Should we handle the case when a custom application type is provided and the user has not explicitly initialized the application module?
            const clazz = java.lang.Class.forName("android.app.ActivityThread");
            if (clazz) {
                const method = clazz.getMethod("currentApplication", null);
                if (method) {
                    nativeApp = method.invoke(null, null);
                }
            }
        }

        // we cannot work without having the app instance
        if (!nativeApp) {
            throw new Error("Failed to retrieve native Android Application object. If you have a custom android.app.Application type implemented make sure that you've called the '<application-module>.android.init' method.");
        }
    }

    return nativeApp;
}

on(orientationChangedEvent, (args: OrientationChangedEventData) => {
    const rootView = getRootView();
    if (rootView) {
        orientationChanged(rootView, args.newValue);
    }
});

global.__onLiveSync = function __onLiveSync(context?: ModuleContext) {
    if (androidApp && androidApp.paused) {
        return;
    }

    const rootView = getRootView();
    livesync(rootView, context);
};

function getOrientationValue(orientation: number): "portrait" | "landscape" | "unknown" {
    switch (orientation) {
        case android.content.res.Configuration.ORIENTATION_LANDSCAPE:
            return "landscape";
        case android.content.res.Configuration.ORIENTATION_PORTRAIT:
            return "portrait";
        default:
            return "unknown";
    }
}

function initLifecycleCallbacks() {
    const setThemeOnLaunch = profile("setThemeOnLaunch", (activity: androidx.appcompat.app.AppCompatActivity) => {
        // Set app theme after launch screen was used during startup
        const activityInfo = activity.getPackageManager().getActivityInfo(activity.getComponentName(), android.content.pm.PackageManager.GET_META_DATA);
        if (activityInfo.metaData) {
            const setThemeOnLaunch = activityInfo.metaData.getInt("SET_THEME_ON_LAUNCH", -1);
            if (setThemeOnLaunch !== -1) {
                activity.setTheme(setThemeOnLaunch);
            }
        }
    });

    const notifyActivityCreated = profile("notifyActivityCreated", function (activity: androidx.appcompat.app.AppCompatActivity, savedInstanceState: android.os.Bundle) {
        androidApp.notify(<AndroidActivityBundleEventData>{ eventName: ActivityCreated, object: androidApp, activity, bundle: savedInstanceState });
    });

    const subscribeForGlobalLayout = profile("subscribeForGlobalLayout", function (activity: androidx.appcompat.app.AppCompatActivity) {
        const rootView = activity.getWindow().getDecorView().getRootView();
        // store the listener not to trigger GC collection before collecting the method
        global.onGlobalLayoutListener = new android.view.ViewTreeObserver.OnGlobalLayoutListener({
            onGlobalLayout() {
                notify({ eventName: displayedEvent, object: androidApp, activity });
                let viewTreeObserver = rootView.getViewTreeObserver();
                viewTreeObserver.removeOnGlobalLayoutListener(global.onGlobalLayoutListener);
            }
        });
        rootView.getViewTreeObserver().addOnGlobalLayoutListener(global.onGlobalLayoutListener);
    });

    const lifecycleCallbacks = new android.app.Application.ActivityLifecycleCallbacks({
        onActivityCreated: profile("onActivityCreated", function (activity: androidx.appcompat.app.AppCompatActivity, savedInstanceState: android.os.Bundle) {
            setThemeOnLaunch(activity);

            if (!androidApp.startActivity) {
                androidApp.startActivity = activity;
            }

            notifyActivityCreated(activity, savedInstanceState);

            if (hasListeners(displayedEvent)) {
                subscribeForGlobalLayout(activity);
            }
        }),

        onActivityDestroyed: profile("onActivityDestroyed", function (activity: androidx.appcompat.app.AppCompatActivity) {
            if (activity === androidApp.foregroundActivity) {
                androidApp.foregroundActivity = undefined;
            }

            if (activity === androidApp.startActivity) {
                androidApp.startActivity = undefined;
            }

            androidApp.notify(<AndroidActivityEventData>{ eventName: ActivityDestroyed, object: androidApp, activity: activity });
            // TODO: This is a temporary workaround to force the V8's Garbage Collector, which will force the related Java Object to be collected.
            gc();
        }),

        onActivityPaused: profile("onActivityPaused", function (activity: androidx.appcompat.app.AppCompatActivity) {
            if ((<any>activity).isNativeScriptActivity) {
                androidApp.paused = true;
                notify(<ApplicationEventData>{ eventName: suspendEvent, object: androidApp, android: activity });
            }

            androidApp.notify(<AndroidActivityEventData>{ eventName: ActivityPaused, object: androidApp, activity: activity });
        }),

        onActivityResumed: profile("onActivityResumed", function (activity: androidx.appcompat.app.AppCompatActivity) {
            androidApp.foregroundActivity = activity;

            androidApp.notify(<AndroidActivityEventData>{ eventName: ActivityResumed, object: androidApp, activity: activity });
        }),

        onActivitySaveInstanceState: profile("onActivitySaveInstanceState", function (activity: androidx.appcompat.app.AppCompatActivity, outState: android.os.Bundle) {
            androidApp.notify(<AndroidActivityBundleEventData>{ eventName: SaveActivityState, object: androidApp, activity: activity, bundle: outState });
        }),

        onActivityStarted: profile("onActivityStarted", function (activity: androidx.appcompat.app.AppCompatActivity) {
            androidApp.notify(<AndroidActivityEventData>{ eventName: ActivityStarted, object: androidApp, activity: activity });
        }),

        onActivityStopped: profile("onActivityStopped", function (activity: androidx.appcompat.app.AppCompatActivity) {
            androidApp.notify(<AndroidActivityEventData>{ eventName: ActivityStopped, object: androidApp, activity: activity });
        })
    });

    return lifecycleCallbacks;
}

function initComponentCallbacks() {
    let componentCallbacks = new android.content.ComponentCallbacks2({
        onLowMemory: profile("onLowMemory", function () {
            gc();
            java.lang.System.gc();
            notify(<ApplicationEventData>{ eventName: lowMemoryEvent, object: this, android: this });
        }),

        onTrimMemory: profile("onTrimMemory", function (level: number) {
            // TODO: This is skipped for now, test carefully for OutOfMemory exceptions
        }),

        onConfigurationChanged: profile("onConfigurationChanged", function (newConfig: android.content.res.Configuration) {
            const newConfigOrientation = newConfig.orientation;
            const newOrientation = getOrientationValue(newConfigOrientation);

            if (androidApp.orientation !== newOrientation) {
                androidApp.orientation = newOrientation;

                notify(<OrientationChangedEventData>{
                    eventName: orientationChangedEvent,
                    android: androidApp.nativeApp,
                    newValue: androidApp.orientation,
                    object: androidApp
                });
            }
        })
    });

    return componentCallbacks;
}

let BroadcastReceiverClass;
function ensureBroadCastReceiverClass() {
    if (BroadcastReceiverClass) {
        return;
    }

    class BroadcastReceiver extends android.content.BroadcastReceiver {
        private _onReceiveCallback: (context: android.content.Context, intent: android.content.Intent) => void;

        constructor(onReceiveCallback: (context: android.content.Context, intent: android.content.Intent) => void) {
            super();
            this._onReceiveCallback = onReceiveCallback;

            return global.__native(this);
        }

        public onReceive(context: android.content.Context, intent: android.content.Intent) {
            if (this._onReceiveCallback) {
                this._onReceiveCallback(context, intent);
            }
        }
    }

    BroadcastReceiverClass = BroadcastReceiver;
}

declare namespace com {
    namespace tns {
        class NativeScriptApplication extends android.app.Application {
            static getInstance(): NativeScriptApplication;
        }
    }
}
