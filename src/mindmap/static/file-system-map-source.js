/*global MM, MAPJS, jQuery*/
MM.FileSystemMapSource = function FileSystemMapSource(fileSystem) {
	'use strict';
	var self = this,
		jsonMimeType = 'application/json',
		stringToContent = function (fileContent, mimeType) {
			var json;
			if (mimeType === jsonMimeType) {
				json = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent;
			} else if (mimeType === 'application/octet-stream') {
				json = JSON.parse(fileContent);
			} else if (mimeType === 'application/x-freemind' || mimeType === 'application/vnd-freemind') {
				json = MM.freemindImport(fileContent);
			}
			return MAPJS.content(json);
		},
		guessMimeType = function (fileName) {
			if (/\.mm$/.test(fileName)) {
				return 'application/x-freemind';
			}
			if (/\.mup$/.test(fileName)) {
				return 'application/json';
			}
			return 'application/octet-stream';
		};
	self.loadMap = function loadMap(mapId, showAuth) {
		var deferred = jQuery.Deferred(),
			editable = { 'application/json': true, 'application/octet-stream': true, 'application/x-freemind': false, 'application/vnd-freemind': false };
		fileSystem.loadMap(mapId, showAuth).then(
			function fileLoaded(stringContent, fileId, mimeType, properties, optionalFileName) {
				if (!mimeType && optionalFileName) {
					mimeType = guessMimeType(optionalFileName);
				}
				properties = jQuery.extend({editable: editable[mimeType]}, properties);
				if (mimeType === 'application/vnd.mindmup.collab') {
					return deferred.reject('map-load-redirect', 'c' + fileId).promise();
				}
				if (editable[mimeType] === undefined) {
					deferred.reject('format-error', 'Unsupported format ' + mimeType);
				} else {
					try {
						deferred.resolve(stringToContent(stringContent, mimeType), fileId, properties);
					} catch (e) {
						deferred.reject('format-error', 'File content not in correct format for this file type');
					}
				}
			},
			deferred.reject,
			deferred.notify
		);
		return deferred.promise();
	};
	self.saveMap = function (map, mapId, showAuth) {
		var deferred = jQuery.Deferred(),
			contentToSave = JSON.stringify(map, null, 2),
			fileName = map.title + '.mup';
		fileSystem.saveMap(contentToSave, mapId, fileName, !!showAuth).then(deferred.resolve, deferred.reject, deferred.notify);
		return deferred.promise();
	};
	self.description = fileSystem.description;
	self.recognises = fileSystem.recognises;
};
