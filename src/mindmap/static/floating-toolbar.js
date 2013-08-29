/*global jQuery*/
jQuery.fn.floatingToolbarWidget = function () {
	'use strict';
	return this.each(function () {
		var element = jQuery(this);
		element.draggable({containment: 'window'});
	});
};
