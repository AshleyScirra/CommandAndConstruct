import Globals from "./globals.js";
import { GameModeBase } from "./gameModes/gameModeBase.js";
import { GameModeSinglePlayer } from "./gameModes/singlePlayer.js";
import { GameModeMultiplayerHost } from "./gameModes/multiplayerHost.js";
import { GameModeMultiplayerPeer } from "./gameModes/multiplayerPeer.js";
// One of the three game mode classes to manage the game.
let gameMode = null;
// Called on startup as game starts to load
runOnStartup(async (runtime) => {
    // Listen for event that fires just before the project starts
    runtime.addEventListener("beforeprojectstart", () => OnBeforeProjectStart(runtime));
});
async function OnBeforeProjectStart(runtime) {
    // Create and release classes when the game layout starts and ends.
    const gameLayout = runtime.getLayout("Game");
    gameLayout.addEventListener("beforelayoutstart", () => OnStartGameLayout(runtime));
    gameLayout.addEventListener("beforelayoutend", () => OnEndGameLayout());
}
// Create a game mode class when the game layout starts.
async function OnStartGameLayout(runtime) {
    if (Globals.gameMode === "single-player")
        gameMode = new GameModeSinglePlayer(runtime);
    else if (Globals.gameMode === "multiplayer-host")
        gameMode = new GameModeMultiplayerHost(runtime);
    else if (Globals.gameMode === "multiplayer-peer")
        gameMode = new GameModeMultiplayerPeer(runtime);
    else
        throw new Error(`invalid game mode '${Globals.gameMode}'`);
    await gameMode.Init();
}
// Release the game mode class when ending the game layout.
function OnEndGameLayout() {
    gameMode.Release();
    gameMode = null;
}
