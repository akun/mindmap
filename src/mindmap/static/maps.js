/*global MM, jQuery, MAPJS, _*/
MM.Maps = {};
MM.Maps['default'] = MM.Maps['new'] = {'title': 'Press F2 or double-click to edit', 'id': 1};

MM.EmbeddedMapSource = function () {
	'use strict';
	var properties = {editable: true, sharable: false};
	this.recognises = function (mapId) {
		if ((/^new-/).test(mapId)) {
			mapId = 'new';
		}
		return MM.Maps[mapId];
	};
	this.loadMap = function (mapId) {
		return jQuery.Deferred().resolve(MAPJS.content(_.clone(this.recognises(mapId))), mapId, properties).promise();
	};
};
