/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsFluidClient } from "@microsoft/live-share";
import { LOCAL_MODE_TENANT_ID } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
// import { WInkSharedInkingSession } from "./WInk/WInkSharedInkingSession";
// import { InkingManager } from "./WInk/InkingManager";
import { SharedInkingSession } from "./CustomInk/SharedInkingSession";
import { InkingManager, InkingTool } from "./CustomInk/core/InkingManager";
import { IColor } from "./CustomInk/canvas/DrawingAttributes";

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
        inkingManager = (container.initialObjects.inkingSession as SharedInkingSession).synchronize(inkingHost);
        inkingManager.activate();
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
    setupButton("btnEraser", () => { inkingManager.tool = InkingTool.Eraser });
    setupButton("btnPointEraser", () => { inkingManager.tool = InkingTool.PointEraser });

    setupButton("btnYellow", () => { inkingManager.drawingAttributes = { ...inkingManager.drawingAttributes, color: { r: 255, g: 252, b: 0, a: 1 } }});
    setupButton("btnGreen", () => { inkingManager.drawingAttributes = { ...inkingManager.drawingAttributes, color: { r: 0, g: 255, b: 0, a: 1 } }});
    setupButton("btnRed", () => { inkingManager.drawingAttributes = { ...inkingManager.drawingAttributes, color: { r: 255, g: 0, b: 0, a: 1 } }});
    setupButton("btnBlue", () => { inkingManager.drawingAttributes = { ...inkingManager.drawingAttributes, color: { r: 0, g: 105, b: 175, a: 1 } }});

    setupButton("btnClear", () => { inkingManager.clear() });
}

start().catch((error) => console.error(error));