/*global jQuery*/
jQuery.fn.titleUpdateWidget = function (mapController) {
	'use strict';
	var elements = this;
	mapController.addEventListener('mapLoaded mapSaved', function (id, contentAggregate) {
		if (elements.prop('title')) {
			elements.prop('title', contentAggregate.title);
		}
	});
};
