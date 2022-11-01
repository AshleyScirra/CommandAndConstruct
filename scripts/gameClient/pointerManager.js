
import { MultiEventHandler } from "../utils/multiEventHandler.js";
import { PointerInfo } from "./pointerInfo.js";
import * as MathUtils from "../utils/clientMathUtils.js";

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
	
	#zoom = 1;							// Zoom scale, e.g. 0.5 for zoomed out to 50%
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		const runtime = this.#gameClient.GetRuntime();
		
		// Handle all kinds of pointer events.
		this.#eventHandlers = new MultiEventHandler([
			[runtime,		"pointerdown",		e => this.#OnPointerDown(e)],
			[runtime,		"pointermove",		e => this.#OnPointerMove(e)],
			[runtime,		"pointerup",		e => this.#OnPointerUp(e)],
			[runtime,		"wheel",			e => this.#OnMouseWheel(e)]
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
		const backgroundLayer = this.GetRuntime().layout.getLayer("Background");
		const [ax, ay] = backgroundLayer.cssPxToLayer(0, 0);
		const [bx, by] = backgroundLayer.cssPxToLayer(clientDx, clientDy);
		this.#ScrollTo(this.#panStartScrollX + (ax - bx), this.#panStartScrollY + (ay - by));
	}
	
	// Scroll to the given position, but apply scroll bounding so the player can't move the
	// view past the edges of the layout.
	#ScrollTo(x, y)
	{
		const [viewportWidth, viewportHeight] = this.#GetViewportSize();
		const [layoutWidth, layoutHeight] = this.#GetLayoutSize();
		
		// Calculate how large the viewport is at this zoom level and use half that
		// size as a margin around the edge of the layout.
		const scaledViewportWidth = viewportWidth / this.#zoom;
		const scaledViewportHeight = viewportHeight / this.#zoom;
		const hbound = scaledViewportWidth / 2;
		const vbound = scaledViewportHeight / 2;
		
		// Scroll to the given position, but limited to the scroll boundaries.
		this.GetRuntime().layout.scrollTo(
			MathUtils.Clamp(x, hbound, layoutWidth - hbound),
			MathUtils.Clamp(y, vbound, layoutHeight - vbound)
		);
	}
	
	// Re-apply the same scroll position so any changed scroll boundaries take effect.
	#ApplyScrollBounds()
	{
		const layout = this.GetRuntime().layout;
		this.#ScrollTo(layout.scrollX, layout.scrollY);
	}
	
	// Use the mouse wheel to zoom by 20% a step.
	#OnMouseWheel(e)
	{
		if (e.deltaY < 0)
			this.SetZoom(this.#zoom * 1.2);
		else
			this.SetZoom(this.#zoom / 1.2);
	}
	
	#GetViewportSize()
	{
		// TODO: get from a runtime API
		return [1920, 1080];
	}
	
	#GetLayoutSize()
	{
		const runtime = this.GetRuntime();
		return [runtime.layout.width, runtime.layout.height];
	}
	
	// Get the minimum zoom value allowed (i.e. the furthest the player can zoom out).
	// This is whatever zoom level is hit first: the viewport width equalling the width
	// of the layout, or the viewport height equalling the height of the layout.
	#GetMinZoom()
	{
		const [viewportWidth, viewportHeight] = this.#GetViewportSize();
		const [layoutWidth, layoutHeight] = this.#GetLayoutSize();
		return Math.max(viewportWidth / layoutWidth, viewportHeight / layoutHeight);
	}
	
	// Set the view to a given zoom level.
	SetZoom(z)
	{
		// Limit the provided zoom level to the allowed range (with 2x zoomed in the maximum allowed).
		z = MathUtils.Clamp(z, this.#GetMinZoom(), 2);
		
		if (this.#zoom === z)
			return;		// no change
		
		this.#zoom = z;
		
		// Update all "Game" sub-layers to scale according to the zoom value.
		const gameLayer = this.GetRuntime().layout.getLayer("Game");
		for (const layer of gameLayer.allSubLayers())
		{
			layer.scale = this.#zoom;
		}
		
		// Zooming out could cause areas outside the layout to become visible. So re-apply the scroll
		// boundaries to ensure the scroll position moves to keep the view inside the layout.
		this.#ApplyScrollBounds();
	}
}