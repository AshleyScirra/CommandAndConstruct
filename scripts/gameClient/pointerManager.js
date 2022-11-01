
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
	
	// For tracking the last mouse position
	#lastMouseX = 0;
	#lastMouseY = 0;
	
	// For panning, the scroll position at the start of the pan
	#panStartScrollX = 0;
	#panStartScrollY = 0;
	
	#zoom = 1;							// Current zoom scale, e.g. 0.5 for zoomed out to 50%
	#targetZoom = 1;					// Target zoom scale for smooth zoom
	
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
		// If this pointer is the mouse, track the last mouse position in client co-ordinates.
		if (e.pointerType === "mouse")
		{
			this.#lastMouseX = e.clientX;
			this.#lastMouseY = e.clientY;
		}
		
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
	
	// Calls Update() on every active PointerInfo to adapt to any changes.
	#UpdateAllPointers()
	{
		for (const pointerInfo of this.#pointerInfos.values())
		{
			pointerInfo.Update();
		}
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
		// Calculate how large the viewport is at this zoom level and use half that
		// size as a margin around the edge of the layout.
		const [layoutWidth, layoutHeight] = this.#GetLayoutSize();
		const [scaledViewportWidth, scaledViewportHeight] = this.#GetScaledViewportSize();
		const hbound = scaledViewportWidth / 2;
		const vbound = scaledViewportHeight / 2;
		
		// Scroll to the given position, but limited to the scroll boundaries.
		this.GetRuntime().layout.scrollTo(
			MathUtils.Clamp(x, hbound, layoutWidth - hbound),
			MathUtils.Clamp(y, vbound, layoutHeight - vbound)
		);
	}
	
	// Use the mouse wheel to zoom.
	#OnMouseWheel(e)
	{
		// Use the wheel deltaY amount in the zoom factor calculation. On one system deltaY
		// was +/- 200, so this calculation gives a zoom factor of 1.2 per step which feels
		// about right, and that should scale according to the device/system settings.
		const zoomFactor = 1 + (Math.abs(e.deltaY) / 1000);
		
		// Note that zooming adjusts the target zoom level, rather than the actual zoom level.
		// The target zoom level is what the zoom level smoothly moves towards.
		if (e.deltaY < 0)
			this.SetZoom(this.#targetZoom * zoomFactor);
		else
			this.SetZoom(this.#targetZoom / zoomFactor);
	}
	
	#GetViewportSize()
	{
		// TODO: get from a runtime API
		return [1920, 1080];
	}
	
	#GetScaledViewportSize()
	{
		const [vw, vh] = this.#GetViewportSize();
		return [vw / this.#zoom, vh / this.#zoom];
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
		// Note this only sets the target zoom level. To smooth out zooms, the actual zoom level
		// is adjusted over time towards the target zoom level.
		this.#targetZoom = MathUtils.Clamp(z, this.#GetMinZoom(), 2);
	}
	
	// When ticking, smoothly move the actual zoom level towards the target zoom level.
	Tick(dt)
	{
		// Once within 0.01% of the target zoom level, just jump to the target zoom level.
		if (Math.abs(this.#targetZoom - this.#zoom) < this.#targetZoom * 0.0001)
		{
			this.#SetActualZoom(this.#targetZoom);
		}
		else
		{
			// Smoothly adjust the zoom level towards the target zoom level at a rate of 99.99% per second.
			// The maths for this, in the form lerp(a, b, 1 - f ^ dt) is explained in this blog post:
			// https://www.construct.net/en/blogs/ashleys-blog-2/using-lerp-delta-time-924
			this.#SetActualZoom(MathUtils.lerp(this.#zoom, this.#targetZoom, 1 - Math.pow(0.0001, dt)));
		}
	}
	
	#SetActualZoom(z)
	{
		if (this.#zoom === z)
			return;		// no change
		
		const lastZoom = this.#zoom;		// save the last zoom value for zoom-to-mouse calculation
		this.#zoom = z;
		
		// Get the current mouse position on the background layer for zoom-to-mouse.
		const layout = this.GetRuntime().layout;
		const backgroundLayer = layout.getLayer("Background");
		const [mouseX, mouseY] = backgroundLayer.cssPxToLayer(this.#lastMouseX, this.#lastMouseY);
		
		// Adjust the scroll position to ensure the zoom happens towards the mouse position.
		const zoomFactor = 1 - (lastZoom / this.#zoom);
		const dx = mouseX - layout.scrollX;
		const dy = mouseY - layout.scrollY;
		this.#ScrollTo(layout.scrollX + dx * zoomFactor,
					   layout.scrollY + dy * zoomFactor);
		
		// Update all "Game" sub-layers to scale according to the zoom value.
		const gameLayer = layout.getLayer("Game");
		for (const layer of gameLayer.allSubLayers())
		{
			layer.scale = this.#zoom;
		}
		
		// Now the zoom level has changed, the layer positions of pointers will have changed.
		// Update all pointers, which acts the same as a pointermove but using the last
		// client position. This helps keep selection boxes in place while zooming.
		this.#UpdateAllPointers();
	}
}