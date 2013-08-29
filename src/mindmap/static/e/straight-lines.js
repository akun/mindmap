/*global Kinetic*/
Kinetic.Connector.prototype.drawFunc = function (canvas) {
	'use strict';
	var context = canvas.getContext(),
		shapeFrom = this.shapeFrom,
		shapeTo = this.shapeTo;
	if (!this.isVisible()) {
		return;
	}
	context.beginPath();
	context.moveTo(shapeFrom.getX() + shapeFrom.getWidth() / 2, shapeFrom.getY() + shapeFrom.getHeight() / 2);
	context.lineTo(shapeTo.getX() + shapeTo.getWidth() / 2, shapeTo.getY() + shapeTo.getHeight() / 2);
	canvas.stroke(this);
};
