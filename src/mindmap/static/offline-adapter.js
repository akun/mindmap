/*global jQuery, MM, observable*/
MM.OfflineAdapter = function (storage) {
	'use strict';
	var properties = {editable: true};
	this.description = 'OFFLINE';
	this.notSharable = true;
	this.recognises = function (mapId) {
		return mapId && mapId[0] === 'o';
	};
	this.loadMap = function (mapId) {
		var result = jQuery.Deferred(),
			map = storage.load(mapId);
		if (map) {
			result.resolve(map, mapId, 'application/json', properties);
		} else {
			result.reject('not-found');
		}
		return result.promise();
	};
	this.saveMap = function (contentToSave, mapId, title) {
		var result = jQuery.Deferred(),
			knownErrors = {
				'QuotaExceededError': 'file-too-large',
				'NS_ERROR_DOM_QUOTA_REACHED': 'file-too-large',
				'QUOTA_EXCEEDED_ERR': 'file-too-large'
			};
		try {
			title = title.replace(/\.mup$/, '');
			if (!this.recognises(mapId)) {
				result.resolve(storage.saveNew(contentToSave, title), properties);
			} else {
				storage.save(mapId, contentToSave, title);
				result.resolve(mapId, properties);
			}
		} catch (e) {
			var reason = knownErrors[e.name];
			if (reason) {
				result.reject(reason);
			} else {
				result.reject('local-storage-failed', e.toString()).promise();
			}
		}
		return result.promise();
	};
};
MM.OfflineMapStorage = function (storage, keyPrefix) {
	'use strict';
	observable(this);
	keyPrefix = keyPrefix || 'offline';
	var dispatchEvent = this.dispatchEvent,
		keyName = keyPrefix + '-maps';
	var newFileInformation = function (fileDescription) {
			return {d: fileDescription, t: Math.round(+new Date() / 1000)};
		},
		newFileId = function (nextFileNumber) {
			return keyPrefix + '-map-' + nextFileNumber;
		},
		storedFileInformation = function () {
			var files = storage.getItem(keyName) || { nextMapId: 1, maps: {}};
			files.maps = files.maps || {};
			return files;
		},
		store = function (fileId, fileContent, files, title) {
			title = title || fileContent.title || JSON.parse(fileContent).title;
			files.maps[fileId] = newFileInformation(title);
			storage.setItem(fileId, {map: fileContent});
			storage.setItem(keyName, files);
		};
	this.save = function (fileId, fileContent, title) {
		store(fileId, fileContent, storedFileInformation(), title);
	};
	this.saveNew = function (fileContent, title) {
		var files = storedFileInformation(),
			fileId = newFileId(files.nextMapId);
		files.nextMapId++;
		store(fileId, fileContent, files, title);
		return fileId;
	};
	this.remove = function (fileId) {
		var files = storedFileInformation();
		storage.remove(fileId);
		delete files.maps[fileId];
		storage.setItem(keyName, files);
		dispatchEvent('mapDeleted', fileId);
	};
	this.restore = function (fileId, fileContent, fileInfo) {
		var files = storedFileInformation();
		files.maps[fileId] = fileInfo;
		storage.setItem(fileId, {map: fileContent});
		storage.setItem(keyName, files);
		dispatchEvent('mapRestored', fileId, fileContent, fileInfo);
	};
	this.list = function () {
		return storedFileInformation().maps;
	};
	this.load = function (fileId) {
		var item = storage.getItem(fileId);
		return item && item.map;
	};
	return this;
};

MM.OfflineMapStorageBookmarks = function (offlineMapStorage, bookmarks) {
	'use strict';
	offlineMapStorage.addEventListener('mapRestored', function (mapId, map, mapInfo) {
		bookmarks.store({
			mapId: mapId,
			title: mapInfo.d
		});
	});

	offlineMapStorage.addEventListener('mapDeleted', function (mapId) {
		bookmarks.remove(mapId, true);
	});
};
