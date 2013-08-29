/*global jQuery, document, escape*/
jQuery.fn.embedMapWidget = function (mapController) {
	'use strict';
	var element = this,
		textArea = element.find('textarea'),
		templateText = textArea.val().trim(),
		selectText = function () {
			if (textArea[0].setSelectionRange) {
				textArea[0].setSelectionRange(0, textArea[0].value.length);
			} else {
				textArea[0].select();
			}
			textArea.focus();
			return false;
		};
	textArea.click(selectText);
	element.on('show', function () {
		element.find('textarea').val(
			templateText.replace(/MAPID/g, mapController.currentMapId())
				.replace(/TITLE/g, (document.title || '').replace(/"/g, '&quot;'))
		);
	});
	element.on('shown', function () {
		selectText();
	});
	return element;
};
