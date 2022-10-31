
import { MultiEventHandler } from "../utils/multiEventHandler.js";
import { PointerInfo } from "./pointerInfo.js";

// PointerManager tracks pointers and decides how to interpret actions based on them.
// A pointer is any kind of mouse, touch or pen input.
export class PointerManager {

	// Private fields
	#gameClient;						// Reference to GameClient
	#eventHandlers;						// MultiEventHandler for selection events
	#pointerInfos = new Map();			// map of pointer id -> PointerInfo
	
	// For panning, the scroll position at the start of the pan
	#panStartScrollX = 0;
	#panStartScrollY = 0;
	
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
	
	// Called when the middle mouse button is pressed, which is used for pan scrolling.
	// Remember the scroll position at the start of the pan.
	StartPan()
	{
		const runtime = this.GetRuntime();
		this.#panStartScrollX = runtime.layout.scrollX;
		this.#panStartScrollY = runtime.layout.scrollY;
	}
	
	// Called when the mouse pointer moves with the middle mouse button pressed for pan scrolling.
	// It passes the distance the pointer has moved in client co-ordinates.
	UpdatePan(clientDx, clientDy)
	{
		// To find how far the given distance is in client co-ordinates is on the background layer,
		// find both (0, 0) and this position in layer co-ordinates, and use the distance between
		// those points. Use that to offset the scroll position from the start of the pan.
		const runtime = this.GetRuntime();
		const backgroundLayer = runtime.layout.getLayer("Background");
		const [ax, ay] = backgroundLayer.cssPxToLayer(0, 0);
		const [bx, by] = backgroundLayer.cssPxToLayer(clientDx, clientDy);
		runtime.layout.scrollTo(this.#panStartScrollX + (ax - bx), this.#panStartScrollY + (ay - by));
	}
}