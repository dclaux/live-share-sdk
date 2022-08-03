/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsFluidClient, UserMeetingRole } from "@microsoft/live-share";
import { LOCAL_MODE_TENANT_ID } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
import { SharedInkingSession, telemetryWithOptimization, telemetryWithoutOptimization } from "./CustomInk/SharedInkingSession";
import { InkingManager, InkingTool } from "./CustomInk/core/InkingManager";

const containerSchema = {
    initialObjects: {
        inkingSession: SharedInkingSession
    }
};

var inkingManager: InkingManager;

async function start() {
    const client = new TeamsFluidClient({
        connection: {
            tenantId: LOCAL_MODE_TENANT_ID,
            tokenProvider: new InsecureTokenProvider("", { id: "123" }),
            orderer: "http://localhost:7070",
            storage: "http://localhost:7070",
        }
    });

    const { container } = await client.joinContainer(containerSchema);

    const inkingHost = document.getElementById("inkingHost");

    if (inkingHost) {
        const inkingSession = container.initialObjects.inkingSession as SharedInkingSession;

        inkingManager = inkingSession.synchronize(inkingHost);
        inkingManager.activate();

        /*
        // Set which roles can draw on the canvas. By default, all roles are allowed
        inkingSession.allowedRoles = [ UserMeetingRole.presenter ];
        */
    }
}

function offsetBy(x: number, y: number) {
    inkingManager.offset = {
        x: inkingManager.offset.x + x,
        y: inkingManager.offset.y + y
    }
}

window.onload = () => {
    const setupButton = (buttonId: string, onClick: () => void) => {
        const button = document.getElementById(buttonId);

        if (button) {
            button.onclick = onClick;
        }
    }

    setupButton("btnStroke", () => { inkingManager.tool = InkingTool.Stroke });
    setupButton("btnLaserPointer", () => { inkingManager.tool = InkingTool.LaserPointer });
    setupButton("btnHighlighter", () => { inkingManager.tool = InkingTool.Highlighter });
    setupButton("btnEraser", () => { inkingManager.tool = InkingTool.Eraser });
    setupButton("btnPointEraser", () => { inkingManager.tool = InkingTool.PointEraser });

    setupButton("btnYellow", () => { inkingManager.strokeBrush.color =  { r: 255, g: 252, b: 0, a: 1 } });
    setupButton("btnGreen", () => { inkingManager.strokeBrush.color = { r: 0, g: 255, b: 0, a: 1 } });
    setupButton("btnRed", () => { inkingManager.strokeBrush.color = { r: 255, g: 0, b: 0, a: 1 } });
    setupButton("btnBlue", () => { inkingManager.strokeBrush.color = { r: 0, g: 105, b: 175, a: 1 } });

    setupButton("btnClear", () => { inkingManager.clear() });

    setupButton("btnOffsetLeft", () => { offsetBy(-10, 0); });
    setupButton("btnOffsetUp", () => { offsetBy(0, -10); });
    setupButton("btnOffsetRight", () => { offsetBy(10, 0); });
    setupButton("btnOffsetDown", () => { offsetBy(0, 10); });

    setupButton("btnZoomOut", () => {
        if (inkingManager.scale > 0.1) {
            inkingManager.scale -= 0.1;
        }
    });
    setupButton("btnZoomIn", () => { inkingManager.scale += 0.1; });

    window.setInterval(
        () => {
            const telemetryDiv = document.getElementById("telemetry");

            if (telemetryDiv) {
                const eventsImprovement = (100 - (100 / telemetryWithoutOptimization.totalEvents * telemetryWithOptimization.totalEvents)).toFixed(2) + "% improvement";
                const pointsImprovement = (100 - (100 / telemetryWithoutOptimization.totalPoints * telemetryWithOptimization.totalPoints)).toFixed(2) + "% improvement";

                telemetryDiv.innerText = `Events: ${telemetryWithOptimization.totalEvents} / ${telemetryWithoutOptimization.totalEvents} (${eventsImprovement}) - Points: ${telemetryWithOptimization.totalPoints} / ${telemetryWithoutOptimization.totalPoints} (${pointsImprovement})`;
            }
        },
        500);
}

start().catch((error) => console.error(error));