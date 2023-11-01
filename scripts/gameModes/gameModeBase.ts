
export class GameModeBase {

	constructor()
	{
	}

	async Init()
	{
	}
	
	Release()
	{
	}
}

export type GameModeType = "single-player" | "multiplayer-host" | "multiplayer-peer";