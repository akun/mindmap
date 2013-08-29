/*global window, $, _, jQuery*/
jQuery.fn.saveWidget = function (mapController) {
	'use strict';
	var mapChanged = false,
		repository,
		autoSave,
		element = jQuery(this),
		saveButton = element.find('button[data-mm-role=publish]'),
		resetSaveButton = function () {
			if (saveButton.attr('disabled')) {
				saveButton.text('Save').addClass('btn-primary').removeAttr('disabled');
				element.find('.dropdown-toggle').removeAttr('disabled');
			}
		},
		mapChangedListener = function () {
			mapChanged = true;
			resetSaveButton();
		},
		setDefaultRepo = function (mapId) {
			var validrepos = mapController.validMapSourcePrefixesForSaving,
				repoClasses = _.map(validrepos, function (x) { return 'repo-' + x + ' '; }).join('');
			repository = (mapId && mapId[0]);
			if (/^new-/.test(mapId) && mapId.length > 4) {
				repository = mapId[4];
			}
			if (!_.contains(validrepos, repository)) {
				repository = validrepos[0];
			}
			element.find('[data-mm-role=currentrepo]').removeClass(repoClasses).addClass('repo repo-' + repository);
		};
	$(window).keydown(function (evt) {
		if (evt.which === 83 && (evt.metaKey || evt.ctrlKey)) {
			if (!autoSave && mapChanged) {
				mapController.publishMap(repository);
			}
			evt.preventDefault();
		}
	});
	element.find('[data-mm-role=publish]').add('a[data-mm-repository]', element).click(function () {
		mapController.publishMap($(this).attr('data-mm-repository') || repository);
	});
	element.find('a[data-mm-repository]').addClass(function () {
		return 'repo repo-' + $(this).data('mm-repository');
	});

	mapController.addEventListener('mapSaving', function () {
		saveButton
			.html('<i class="icon-spinner icon-spin"></i>&nbsp;Saving')
			.attr('disabled', true)
			.removeClass('btn-primary');
		element.find('.dropdown-toggle').attr('disabled', true);
	});
	mapController.addEventListener('mapSavingFailed mapSavingUnAuthorized authorisationFailed authRequired mapSavingCancelled', resetSaveButton);

	mapController.addEventListener('mapLoaded mapSaved', function (mapId, idea, properties) {
		setDefaultRepo(mapId);
		mapChanged = false;
		saveButton.text('Save').attr('disabled', true).removeClass('btn-primary');
		element.find('.dropdown-toggle').removeAttr('disabled');
		autoSave = properties.autoSave;
		if (!autoSave) {
			idea.addEventListener('changed', mapChangedListener);
		} else {
			saveButton.text(' Auto-saved');
		}
	});
	return element;
};
