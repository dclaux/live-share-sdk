/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsFluidClient } from "@microsoft/live-share";
import { LOCAL_MODE_TENANT_ID } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";

import { SharedInkingSession } from "./SharedInkingSession";

import { InkingManager } from "./InkingManager";

const containerSchema = {
    initialObjects: {
        inkingSession: SharedInkingSession
    }
};

async function start() {
    const client = new TeamsFluidClient({
        connection: {
            tenantId: LOCAL_MODE_TENANT_ID,
            tokenProvider: new InsecureTokenProvider("", { id: "123" }),
            orderer: "http://localhost:7070",
            storage: "http://localhost:7070",
        }
    });

    client.joinContainer(containerSchema);

    const inkingHost = document.getElementById("inkingHost");

    if (inkingHost) {
        const inkingManager = new InkingManager(inkingHost);

        inkingManager.activate();
    }
}

start().catch((error) => console.error(error));