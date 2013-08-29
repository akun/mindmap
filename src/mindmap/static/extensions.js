/*global jQuery, MM, _, location, window, document */
MM.Extensions = function (storage, storageKey, config, components) {
	'use strict';
	var active = [],
		loadScriptsAsynchronously = function (d, s, urls, callback) {
			urls.forEach(function (url) {
				var js, fjs = d.getElementsByTagName(s)[0];
				js = d.createElement(s);
				js.src = (document.location.protocol === 'file:' ? 'http:' : '') + url;
				js.onload = callback;
				fjs.parentNode.insertBefore(js, fjs);
			});
		},
		getScriptsForExtensions = function (extensionNameArray) {
			return _.flatten(_.reject(_.map(extensionNameArray, function (ext) {
				return MM.Extensions.config[ext] && MM.Extensions.config[ext].script.split(' ');
			}), function (e) { return !e; }));
		};
	if (storage[storageKey]) {
		active = storage[storageKey].split(' ');
	}
	this.requiredExtension = function (mapId) {
		var key, ext;
		/*jslint forin:true*/
		for (key in MM.Extensions.config) {
			ext = MM.Extensions.config[key];
			if (ext.providesMapId && ext.providesMapId(mapId)) {
				return key;
			}
		}
	};
	this.scriptsToLoad = function (optionalMapId) {
		var optional = this.requiredExtension(optionalMapId),
			loading = optional ? _.union(active, optional) : active,
			scriptArray = getScriptsForExtensions(loading);
		return _.map(scriptArray, function (script) { return '/' + config.cachePreventionKey + script; });
	};
	this.isActive = function (ext) {
		return _.contains(active, ext);
	};
	this.setActive = function (ext, shouldActivate) {
		if (shouldActivate) {
			active = _.union(active, [ext]);
		} else {
			active = _.without(active, ext);
		}
		storage[storageKey] = active.join(' ');
		if (components && components.activityLog) {
			components.activityLog.log('Extensions', ext, 'act-' + shouldActivate);
		}
	};
	this.load = function (optionalMapId) {
		var deferred = jQuery.Deferred(),
			scripts = this.scriptsToLoad(optionalMapId),
			alertId,
			intervalId;
		MM.Extensions.components = components;
		MM.Extensions.mmConfig = config;
		loadScriptsAsynchronously(document, 'script', config.scriptsToLoadAsynchronously.split(' '));
		MM.Extensions.pendingScripts = _.invert(scripts);
		loadScriptsAsynchronously(document, 'script', scripts, function () {
			delete MM.Extensions.pendingScripts[jQuery(this).attr('src')];
		});

		if (!_.isEmpty(MM.Extensions.pendingScripts)) {
			alertId = components.alert.show('Please wait, loading extensions... <i class="icon-spinner icon-spin"></i>&nbsp;<span data-mm-role="num-extensions"></span>');
			intervalId = window.setInterval(function () {
				if (_.isEmpty(MM.Extensions.pendingScripts)) {
					components.alert.hide(alertId);
					window.clearInterval(intervalId);
					deferred.resolve();
				} else {
					jQuery('[data-mm-role=num-extensions]').text(_.size(MM.Extensions.pendingScripts) + ' remaining');
				}
			}, 1000);
		} else {
			deferred.resolve();
		}
		return deferred.promise();
	};
};
MM.Extensions.config = {
	'goggle-collaboration' : {
		name: 'Realtime collaboration',
		script: '/e/google-collaboration.js',
		icon: 'icon-group',
		doc: 'http://blog.mindmup.com/p/realtime-collaboration.html',
		desc: 'Realtime collaboration on a map, where several people can concurrently change it and updates are shown to everyone almost instantly. Collaboration is persisted using Google Drive.',
		providesMapId: function (mapId) {
			'use strict';
			return (/^cg/).test(mapId);
		}
	},
	'progress' : {
		name: 'Progress',
		script: '/e/progress.js',
		icon: 'icon-dashboard',
		doc: 'http://blog.mindmup.com/p/monitoring-progress.html',
		desc: 'Progress allows you to manage hierarchies of tasks faster by propagating statuses to parent nodes. For example, when all sub-tasks are completed, the parent task is marked as completed automatically.',
		aggregateAttributeName: 'progress-statuses',
		isActiveOnMapContent: function (content) {
			'use strict';
			return content.getAttr(MM.Extensions.config.progress.aggregateAttributeName);
		}
	},
	'straight-lines' : {
		name: 'Straight lines',
		script: '/e/straight-lines.js',
		icon: 'icon-reorder',
		doc: 'http://blog.mindmup.com/p/straight-lines.html',
		desc: 'This extension converts funky curve connectors into straight lines, which makes it clearer to see what connects to what on large maps'
	},
	'github' : {
		name: 'Github',
		script: '/e/github.js',
		icon: 'icon-github',
		doc: 'http://www.github.com',
		desc: 'Store your maps on Github',
		providesMapId: function (mapId) {
			'use strict';
			return (/^h/).test(mapId);
		}
	}
};
jQuery.fn.extensionsWidget = function (extensions, mapController, alert) {
	'use strict';
	var element = this,
		alertId,
		showAlertWithCallBack = function (message, prompt, type, callback) {
			alertId = alert.show(
				message,
				'<a href="#" data-mm-role="alert-callback">' + prompt + '</a>',
				type
			);
			jQuery('[data-mm-role=alert-callback]').click(function () {
				alert.hide(alertId);
				callback();
			});
		},
		listElement = element.find('[data-mm-role=ext-list]'),
		template = listElement.find('[data-mm-role=template]').hide().clone(),
		changed = false,
		causedByMapId;
	_.each(MM.Extensions.config, function (ext, extkey) {
		var item = template.clone().appendTo(listElement).show();
		item.find('[data-mm-role=title]').html('&nbsp;' + ext.name).addClass(ext.icon);
		item.find('[data-mm-role=doc]').attr('href', ext.doc);
		item.find('[data-mm-role=desc]').prepend(ext.desc);
		item.find('input[type=checkbox]').attr('checked', extensions.isActive(extkey)).change(function () {
			extensions.setActive(extkey, this.checked);
			changed = true;
		});
	});
	element.on('hidden', function () {
		if (changed) {
			if (!causedByMapId) {
				location.reload();
			} else {
				window.location = '/map/' + causedByMapId;
			}
		}
		causedByMapId = undefined;
	});

	mapController.addEventListener('mapIdNotRecognised', function (newMapId) {
		var required = extensions.requiredExtension(newMapId);
		alert.hide(alertId);
		if (required) {
			showAlertWithCallBack(
				'This map requires an extension to load!',
				'Click here to enable the ' +  MM.Extensions.config[required].name + ' extension',
				'warning',
				function () {
					causedByMapId = newMapId;
					element.modal('show');
				}
			);
		} else {
			alertId = alert.show('The URL is unrecognised!', 'it might depend on a custom extension that is not available to you.', 'error');
		}

	});
	mapController.addEventListener('mapLoaded', function (mapId, mapContent) {
		var requiredExtensions = _.filter(MM.Extensions.config, function (ext, id) { return ext.isActiveOnMapContent && ext.isActiveOnMapContent(mapContent) && !extensions.isActive(id); }),
			plural = requiredExtensions.length > 1 ? 's' : '';
		alert.hide(alertId);
		if (requiredExtensions.length) {
			showAlertWithCallBack(
				'This map uses additional extensions!',
				'Click here to enable the ' +  _.map(requiredExtensions, function (ext) { return ext.name; }).join(', ') + ' extension' + plural,
				'warning',
				function () {
					causedByMapId = mapId;
					element.modal('show');
				}
			);
		}
	});
	return element;
};


