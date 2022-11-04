
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
	
	// For pan-scrolling, the last client position of the pan position.
	// These values start as NaN for the first update but are then the last client position.
	#panLastClientX = NaN;
	#panLastClientY = NaN;
	
	// For pinch-to-zoom
	#didPinchZoomChange = false;		// set to true when any pinch-to-zoom pointer moves
	#pinchStartZoom = 0;				// zoom level at the start of the pinch-to-zoom gesture
	
	#zoom = 1;							// Current zoom scale, e.g. 0.5 for zoomed out to 50%
	#targetZoom = 1;					// Target zoom scale for smooth zoom
	#zoomToX = 0;						// Position to zoom to or from
	#zoomToY = 0;
	
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
		const pointerInfo = new PointerInfo(this, e);
		
		// Check if there are now two touch pointers that could be used for pinch-to-zoom.
		if (e.pointerType === "touch")
			this.#MaybeStartPinchToZoom(pointerInfo);
		
		// Add this pointer to the map of all pointers by their pointer ID.
		this.#pointerInfos.set(e.pointerId, pointerInfo);
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
		
		// If this pointer was for pinch-to-zoom, there could be one remaining pinch-to-zoom
		// pointer that is used for pan scrolling only. To avoid the scroll position jumping
		// due to the old mid-point being somewhere else, restart the pan.
		if (pointerInfo.GetActionType() === "pinch-zoom")
			this.StartPan();
	}
	
	// Calls Update() on every active PointerInfo to adapt to any changes.
	#UpdateAllPointers()
	{
		for (const pointerInfo of this.#pointerInfos.values())
		{
			pointerInfo.Update();
		}
	}
	
	// Called when starting a pan, either by middle mouse button or a pinch-to-zoom gesture.
	StartPan()
	{
		// Reset the last pan client position to NaN so the next call to UpdatePan()
		// knows it's the first update since the pan started.
		this.#panLastClientX = NaN;
		this.#panLastClientY = NaN;
	}
	
	// Called when the pan position moves during a middle-mouse or touch pan.
	// It passes the current position in client co-ordinates, and uses the difference from
	// the last pan client position to determine how far to scroll.
	UpdatePan(clientX, clientY)
	{
		// The first time this method is called the last client pan position is NaN.
		// In that case don't attempt to scroll, as we don't know what the difference is
		// from the last position yet.
		if (!isNaN(this.#panLastClientX) && !isNaN(this.#panLastClientY))
		{
			// Identify the distance moved in client co-ordinates.
			const clientDx = clientX - this.#panLastClientX;
			const clientDy = clientY - this.#panLastClientY;
			
			// To find how far the given distance in client co-ordinates is on the background layer,
			// find both (0, 0) and this position in layer co-ordinates, and use the distance between
			// those points. Use that to offset the scroll position.
			const layout = this.GetRuntime().layout;
			const backgroundLayer = layout.getLayer("Background");
			const [ax, ay] = backgroundLayer.cssPxToLayer(0, 0);
			const [bx, by] = backgroundLayer.cssPxToLayer(clientDx, clientDy);
			this.#ScrollTo(layout.scrollX + (ax - bx), layout.scrollY + (ay - by));
		}
		
		// Save the last client pan position for the next call.
		this.#panLastClientX = clientX;
		this.#panLastClientY = clientY;
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
		
		// Use the mouse position as the position to zoom in to/out from.
		this.#zoomToX = this.#lastMouseX;
		this.#zoomToY = this.#lastMouseY;
		
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
		// If a pinch-to-zoom pointer changed in the past tick, call #UpdatePinchZoom().
		// This handles both pinch-to-zoom pointers at the same time.
		if (this.#didPinchZoomChange)
		{
			this.#UpdatePinchZoom();
			this.#didPinchZoomChange = false;
		}
		
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
		
		const lastZoom = this.#zoom;		// save the last zoom value for zoom-to-position calculation
		this.#zoom = z;
		
		// Get the zoom position (from which to zoom in to/out from) on the background layer.
		const layout = this.GetRuntime().layout;
		const backgroundLayer = layout.getLayer("Background");
		const [zoomToX, zoomToY] = backgroundLayer.cssPxToLayer(this.#zoomToX, this.#zoomToY);
		
		// Adjust the scroll position to ensure the zoom happens towards the given position.
		const zoomFactor = 1 - (lastZoom / this.#zoom);
		const dx = zoomToX - layout.scrollX;
		const dy = zoomToY - layout.scrollY;
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
	
	// Called when a new touch pointer starts to check if a pinch-to-zoom gesture should start.
	// The new touch pointer should be the second touch pointer, and there must not already be
	// a pinch-to-zoom already happening with other touch pointers.
	#MaybeStartPinchToZoom(newPointer)
	{
		let otherPointer = null;			// other existing pointer to pinch-to-zoom with
		let numPinchZoomPointers = 0;		// count of any existing pinch-to-zoom pointers
		
		// Check all existing pointers. Note this does not yet include the new pointer.
		for (const existingPointer of this.#pointerInfos.values())
		{
			if (existingPointer.GetPointerType() !== "touch")
				continue;		// ignore non-touch pointers
			
			// Count how many existing pinch-to-zoom pointers there are.
			// If there are already 2, then don't allow any new pinch-to-zoom gesture to start.
			if (existingPointer.GetActionType() === "pinch-zoom")
			{
				numPinchZoomPointers++;
				
				if (numPinchZoomPointers >= 2)
					return;
			}
			
			// Otherwise use this touch pointer for the pinch-to-zoom gesture.
			otherPointer = existingPointer;
		};
		
		// If there is another touch pointer that can be used for pinch-to-zoom, start the gesture.
		// Note the other pointer can be in any state, including dragging, or a leftover single
		// pointer in pinch-to-zoom mode (which is used for panning only, but can be restarted as
		// a two-pointer pinch-to-zoom with a new touch pointer).
		if (otherPointer)
		{
			// Save the zoom level at the start of the pinch-to-zoom gesture, and start a new
			// pan as the gesture can also scroll the view.
			this.#pinchStartZoom = this.#zoom;
			this.StartPan();
			
			// Start pinch-to-zoom with both touch pointers.
			newPointer.StartPinchZoom();
			otherPointer.StartPinchZoom();
		}
	}
	
	// Called when any pinch-to-zoom pointer moves. This just sets a flag to call #UpdatePinchZoom()
	// at the end of the tick, since that can handle both pointers at once, rather than one at a time.
	SetPinchZoomChanged()
	{
		this.#didPinchZoomChange = true;
	}
	
	// When one or both pinch-to-zoom pointers move, this is called to update the zoom level
	// and scroll position accordingly.
	#UpdatePinchZoom()
	{
		// Of all active pointers, find the ones in pinch-to-zoom mode.
		const pinchZoomPointers = [...this.#pointerInfos.values()]
									.filter(pi => pi.GetActionType() === "pinch-zoom");
		
		// If there is only one pointer in pinch-to-zoom mode, keep using it for scrolling
		// the view only, but not zooming. This means if the user starts a pinch-to-zoom with
		// two touches, then removes only one touch, the remaining touch can be used to
		// keep scrolling; adding a second touch will then restore full pinch-to-zoom again.
		if (pinchZoomPointers.length === 1)
		{
			this.#UpdatePinchZoom_1Pointer(pinchZoomPointers[0]);
		}
		// With two pinch-to-zoom pointers handle both scrolling and zooming based on
		// the distance between the two pointers.
		else if (pinchZoomPointers.length === 2)
		{
			this.#UpdatePinchZoom_2Pointers(pinchZoomPointers[0], pinchZoomPointers[1]);
		}
	}
	
	#UpdatePinchZoom_1Pointer(pointerInfo)
	{
		// Using just one pinch-to-zoom pointer keeps scrolling the view.
		const [curX, curY] = pointerInfo.GetLastClientPosition();
		this.UpdatePan(curX, curY);
	}
	
	#UpdatePinchZoom_2Pointers(pointer0, pointer1)
	{
		// Get both the start position and current position of both pointers.
		const [p0startX, p0startY] = pointer0.GetStartClientPosition();
		const [p1startX, p1startY] = pointer1.GetStartClientPosition();
		const [p0curX, p0curY] = pointer0.GetLastClientPosition();
		const [p1curX, p1curY] = pointer1.GetLastClientPosition();
		
		// Find the current mid-point of the two pointers. Use this position for scrolling.
		const curMidX = (p0curX + p1curX) / 2;
		const curMidY = (p0curY + p1curY) / 2;
		this.UpdatePan(curMidX, curMidY);
		
		// Also use the current mid-point as the zoom position, so zooming happens relative
		// to that position the same way it does with mouse wheel zooming.
		this.#zoomToX = curMidX;
		this.#zoomToY = curMidY;
		
		// Find the original distance between the two pointers, and the current distance.
		// Zoom the view according to the change in distance.
		const startDist = MathUtils.DistanceTo(p0startX, p0startY, p1startX, p1startY);
		const curDist = MathUtils.DistanceTo(p0curX, p0curY, p1curX, p1curY);
		this.SetZoom(this.#pinchStartZoom * (curDist / startDist));
	}
}