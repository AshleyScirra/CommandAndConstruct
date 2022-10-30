
// This represents extra state for tracking pointers in SelectionManager.
// It's used like a struct or normal JavaScript object, so has public fields.
export class PointerInfo {
	clientX = 0;
	clientY = 0;
	isDrag = false;
	
	constructor(clientX, clientY)
	{
		this.clientX = clientX;
		this.clientY = clientY;
	}
}