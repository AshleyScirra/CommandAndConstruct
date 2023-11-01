
import { type GameModeType } from "./gameModes/gameModeBase.js";

// Global variables held in a separate export.
export default {

	// The game mode is one of "single-player", "multiplayer-host" or "multiplayer-peer".
	// It defaults to single-player since it's the quickest way to test when previewing in Construct.
	gameMode: <GameModeType> "single-player"
	
};