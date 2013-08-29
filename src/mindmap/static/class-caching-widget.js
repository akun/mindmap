/*global window, jQuery*/
jQuery.fn.classCachingWidget = function (keyPrefix, store) {
	'use strict';
	var element = jQuery(this),
		key = keyPrefix + '-' + element.selector;
	jQuery(window).unload(function () {
		store[key] = element.attr('class');
	});
	element.addClass(store[key]);
	return this;
};
