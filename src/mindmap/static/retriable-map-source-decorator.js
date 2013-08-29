/*global MM, MAPJS, jQuery*/
MM.retry = function (task, shouldRetry, backoff) {
	'use strict';
	var deferred = jQuery.Deferred(),
		attemptTask = function () {
			task().then(
				deferred.resolve,
				function () {
					if (!shouldRetry || shouldRetry.apply(undefined, arguments)) {
						deferred.notify('Network problem... Will retry shortly');
						if (backoff) {
							setTimeout(attemptTask, backoff());
						} else {
							attemptTask();
						}
					} else {
						deferred.reject.apply(deferred, arguments);
					}
				},
				deferred.notify
			);
		};
	attemptTask();
	return deferred.promise();
};
MM.retryTimes = function (retries) {
	'use strict';
	return function () {
		return retries--;
	};
};
MM.linearBackoff = function () {
	'use strict';
	var calls = 0;
	return function () {
		calls++;
		return 1000 * calls;
	};
};

MM.RetriableMapSourceDecorator = function (adapter) {
	'use strict';
	var	shouldRetry = function (retries) {
			var times = MM.retryTimes(retries);
			return function (status) {
				return times() && status === 'network-error';
			};
		};
	this.loadMap = function (mapId, showAuth) {
		return MM.retry(
			adapter.loadMap.bind(adapter, mapId, showAuth),
			shouldRetry(5),
			MM.linearBackoff()
		);
	};
	this.saveMap = function (contentToSave, mapId, fileName) {
		return MM.retry(
			adapter.saveMap.bind(adapter, contentToSave, mapId, fileName),
			shouldRetry(5),
			MM.linearBackoff()
		);
	};
	this.description = adapter.description;
	this.recognises = adapter.recognises;
	this.autoSave = adapter.autoSave;
};
