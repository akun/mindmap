/*global jQuery,document, setTimeout*/
jQuery.fn.urlShortenerWidget = function (googleShortenerApiKey, activityLog, mapController, baseUrl) {
	'use strict';
	var list = this,
		shortenerRetriesLeft = 5,
		fireShortener = function (navUrl) {
			if (document.location.protocol === 'file:') {
				return;
			}
			jQuery.ajax({
				type: 'post',
				url: 'https://www.googleapis.com/urlshortener/v1/url?key=' + googleShortenerApiKey,
				dataType: 'json',
				contentType: 'application/json',
				data: '{"longUrl": "' + navUrl + '"}',
				success: function (result) {
					list.data('mm-url', result.id)
						.filter('[data-mm-role=short-url]').show().val(result.id)
						.on('input', function () {
							jQuery(this).val(result.id);
						}).click(function () {
							if (this.setSelectionRange) {
								this.setSelectionRange(0, result.id.length);
							} else {
								this.select();
							}
							return false;
						});
				},
				error: function (xhr, err, msg) {
					if (shortenerRetriesLeft > 0) {
						shortenerRetriesLeft--;
						setTimeout(fireShortener, 1000);
					} else {
						activityLog.log('Map', 'URL shortener failed', err + ' ' + msg);
					}
				}
			});
		},
		previousUrl,
		sharingUrl = function (mapId) {
			return baseUrl + 'map/' + mapId;
		};

	mapController.addEventListener('mapLoaded mapSaved', function (mapId, map, properties) {
		var navUrl = sharingUrl(mapId);
		if (previousUrl === navUrl) {
			return;
		}
		previousUrl = navUrl;
		list.data('mm-url', navUrl);
		fireShortener(navUrl);
	});
	return list;
};
