
import { MultiEventHandler } from "../utils/multiEventHandler.js";
import { PointerInfo } from "./pointerInfo.js";

// PointerManager tracks pointers and decides how to interpret actions based on them.
// A pointer is any kind of mouse, touch or pen input.
export class PointerManager {

	// Private fields
	#gameClient;						// Reference to GameClient
	#eventHandlers;						// MultiEventHandler for selection events
	#pointerInfos = new Map();			// map of pointer id -> PointerInfo
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		const runtime = this.#gameClient.GetRuntime();
		
		// Handle all kinds of pointer events.
		this.#eventHandlers = new MultiEventHandler([
			[runtime,		"pointerdown",		e => this.#OnPointerDown(e)],
			[runtime,		"pointermove",		e => this.#OnPointerMove(e)],
			[runtime,		"pointerup",		e => this.#OnPointerUp(e)]
		]);
	}
	
	Release()
	{
		this.#eventHandlers.Release();
	}
	
	GetGameClient()
	{
		return this.#gameClient;
	}
	
	GetRuntime()
	{
		return this.#gameClient.GetRuntime();
	}
	
	GetSelectionManager()
	{
		return this.#gameClient.GetSelectionManager();
	}
	
	#OnPointerDown(e)
	{
		if (this.#pointerInfos.has(e))
			return;		// ignore if already got this pointer ID
		
		// Create a PointerInfo to track the state of this pointer over time.
		this.#pointerInfos.set(e.pointerId, new PointerInfo(this, e));
	}
	
	#OnPointerMove(e)
	{
		const pointerInfo = this.#pointerInfos.get(e.pointerId);
		if (!pointerInfo)
			return;		// unknown pointer id, ignore
		
		pointerInfo.OnMove(e);
	}
	
	#OnPointerUp(e)
	{
		const pointerInfo = this.#pointerInfos.get(e.pointerId);
		if (!pointerInfo)
			return;		// unknown pointer id, ignore
		
		pointerInfo.OnUp(e);
		
		// Delete the pointer id from the start position map as the pointer is no longer in use.
		this.#pointerInfos.delete(e.pointerId);
	}
}