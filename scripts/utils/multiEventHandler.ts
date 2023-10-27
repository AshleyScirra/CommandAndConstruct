
// This is a small helper class to make it easier to add and remove
// a list of event listeners.
// Without it there would need to be long lists of event listeners with each
// handler being a property to make sure it can be released again, e.g.:
//
// this.pointerdown_handler = (e => ...);
// this.pointermove_handler = (e => ...)
// this.pointerup_handler = (e => ...);
// runtime.addEventListener("pointerdown", this.pointerdown_handler);
// runtime.addEventListener("pointermove", this.pointermove_handler);
// runtime.addEventListener("pointerup", this.pointerup_handler);
//
// And then later:
//
// runtime.removeEventListener("pointerdown", this.pointerdown_handler);
// runtime.removeEventListener("pointermove", this.pointermove_handler);
// runtime.removeEventListener("pointerup", this.pointerup_handler);
//
// This class simplifies this by allowing a table of event listeners, e.g.:
//
// this.eventHandlers = new MultiEventHandler([
//	 [runtime, "pointerdown", e => ... ],
//	 [runtime, "pointermove", e => ... ],
//	 [runtime, "pointerup", e => ... ],
//]);
//
// All those event handlers can then be removed by a single call:
//
// this.eventHandlers.Release();
//
// This reduces the repetition of event handlers, is less error prone
// as all events are automatically removed, and avoids the need for
// a property for each event handler function.

export class MultiEventHandler {

	#eventHandlers;
	
	constructor(arr)
	{
		this.#eventHandlers = arr;
		
		for (const [obj, eventName, handler] of this.#eventHandlers)
		{
			obj.addEventListener(eventName, handler);
		}
	}
	
	Release()
	{
		for (const [obj, eventName, handler] of this.#eventHandlers)
		{
			obj.removeEventListener(eventName, handler);
		}
	}
}