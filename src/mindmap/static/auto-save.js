/*global MM, observable*/
MM.AutoSave = function (mapController, storage, alertDispatcher) {
	'use strict';
	var prefix = 'auto-save-',
		self = this,
		currentMapId,
		currentIdea,
		events = [],
		isWarningShown = false,
		checkForLocalChanges = function (mapId) {
			var value = storage.getItem(prefix + mapId);
			if (value) {
				self.dispatchEvent('unsavedChangesAvailable', mapId);
			}
		},
		trackChanges = function (idea, mapId) {
			events = [];
			idea.addEventListener('changed', function (command, params) {
				events.push({cmd: command, args: params});
				try {
					storage.setItem(prefix + mapId, events);
				} catch (e) {
					if (!isWarningShown) {
						isWarningShown = true;
						alertDispatcher.show('Problem with auto save!', 'We could not autosave the changes - there is not enough free space in your local browser repository.', 'warning');
					}
				}
			});
		};
	observable(this);
	self.applyUnsavedChanges = function () {
		var events = storage.getItem(prefix + currentMapId);
		if (events) {
			events.forEach(function (event) {
				currentIdea.execCommand(event.cmd, event.args);
			});
		}
	};
	self.discardUnsavedChanges = function () {
		events = [];
		storage.remove(prefix + currentMapId);
	};
	mapController.addEventListener('mapSaved', function (mapId, idea) {
		isWarningShown = false;
		if (mapId === currentMapId || idea === currentIdea) {
			self.discardUnsavedChanges();
		}
	});
	mapController.addEventListener('mapLoaded', function (mapId, idea, properties) {

		if (!properties || !properties.autoSave) {
			currentMapId = mapId;
			currentIdea = idea;
			isWarningShown = false;
			checkForLocalChanges(mapId);
			trackChanges(idea, mapId);
		}
	});
};
