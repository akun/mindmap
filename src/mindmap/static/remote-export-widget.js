/*global $, jQuery, MM, document, MAPJS, window, atob, ArrayBuffer, Uint8Array*/
jQuery.fn.remoteExportWidget = function (mapController, alert) {
	'use strict';
	var self = this,
		loadedIdea,
		downloadLink = ("download" in document.createElement("a")) ? $('<a>').addClass('hide').appendTo('body') : undefined,
		joinLines = function (string) {
			return string.replace(/\n/g, ' ').replace(/\r/g, ' ');
		},
		dataUriToBlob = function (dataURI) {
			var byteString = atob(dataURI.split(',')[1]),
				mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0],
				ab = new ArrayBuffer(byteString.length),
				ia = new Uint8Array(ab),
				i;
			for (i = 0; i < byteString.length; i++) {
				ia[i] = byteString.charCodeAt(i);
			}
			return new window.Blob([ab], {type: mimeString});
		},
		toObjectURL = function (contents, mimeType) {
			var browserUrl = window.URL || window.webkitURL;
			if (/^data:[a-z]*\/[a-z]*/.test(contents)) {
				return browserUrl.createObjectURL(dataUriToBlob(contents));
			}
			return browserUrl.createObjectURL(new window.Blob([contents], {type: mimeType}));
		};
	mapController.addEventListener('mapLoaded', function (mapId, idea) {
		loadedIdea = idea;
	});
	return this.click(function () {
		var exportForm = $($(this).data('mm-target')),
			toPromise = function (fn, mimeType) {
				return function () {
					return jQuery.Deferred().resolve(fn.apply(undefined, arguments), mimeType).promise();
				};
			},
			exportFunctions = {
				'mup' : toPromise(function (contentObject) { return JSON.stringify(contentObject, null, 2); }, 'application/json'),
				'mm' : toPromise(MM.freemindExport, 'text/xml'),
				'html': MM.exportToHtmlDocument,
				'png': MAPJS.pngExport,
				'txt': toPromise(MM.exportIdeas.bind({}, loadedIdea, new MM.TabSeparatedTextExporter()), 'text/plain')
			},
			format = $(this).data('mm-format'),
			title,
			elem,
			alertId;
		title = loadedIdea.title + '.' + format;
		if (alert) {
			alertId = alert.show('<i class="icon-spinner icon-spin"></i>&nbsp;Exporting map to ' + title, 'This may take a few seconds for larger maps', 'info');
		}
		elem = $(this);
		if (exportFunctions[format]) {
			exportFunctions[format](loadedIdea).then(
				function (contents, mimeType) {
					if (!contents) {
						return false;
					}
					if (alert && alertId) {
						alert.hide(alertId);
						alertId = undefined;
					}
					if (downloadLink && (!$('body').hasClass('force-remote'))) {
						downloadLink.attr('download', title).attr('href', toObjectURL(contents, mimeType));
						downloadLink[0].click();
					} else {
						exportForm.find('[name=title]').val(joinLines(title));
						exportForm.find('[name=map]').val(contents);
						exportForm.submit();
					}
				}
			);
		}
	});
};
