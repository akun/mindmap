/*global _, jQuery, MM, window, gapi, google */
MM.GoogleDriveAdapter = function (appId, clientId, apiKey, networkTimeoutMillis, defaultContentType) {
	'use strict';
	var properties = {},
		driveLoaded,
		isAuthorised = function () {
			return !!(window.gapi && gapi.auth && gapi.auth.getToken() && gapi.auth.getToken().access_token);
		},
		recognises = function (mapId) {
			return mapId && mapId[0] === 'g';
		},
		toGoogleFileId = function (mapId) {
			if (recognises(mapId)) {
				return mapId.substr(2);
			}
		},
		mindMupId = function (googleId) {
			return 'g1' + (googleId || '');
		},
		checkAuth = function (showDialog) {
			var deferred = jQuery.Deferred();
			deferred.notify('Authenticating with Google');
			gapi.auth.authorize(
				{
					'client_id': clientId,
					'scope': 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.install https://www.googleapis.com/auth/userinfo.profile',
					'immediate': !showDialog
				},
				function (authResult) {
					if (authResult) {
						deferred.resolve();
					} else {
						deferred.reject('not-authenticated');
					}
				}
			);
			return deferred.promise();
		},
		saveFile = function (contentToSave, mapId, fileName, paramContentType) {
			var	googleId =  toGoogleFileId(mapId),
				deferred = jQuery.Deferred(),
				boundary = '-------314159265358979323846',
				delimiter = '\r\n--' + boundary + '\r\n',
				closeDelim = '\r\n--' + boundary + '--',
				contentType = paramContentType || defaultContentType,
				metadata = {
					'title': fileName,
					'mimeType': contentType
				},
				multipartRequestBody =
					delimiter +
					'Content-Type: application/json\r\n\r\n' +
					JSON.stringify(metadata) +
					delimiter +
					'Content-Type: ' + contentType + '\r\n' +
					'\r\n' +
					contentToSave +
					closeDelim,
				request = gapi.client.request({
					'path': '/upload/drive/v2/files' + (googleId ? '/' + googleId : ''),
					'method': (googleId ? 'PUT' : 'POST'),
					'params': {'uploadType': 'multipart', 'useContentAsIndexableText': (contentToSave.length < 131072)}, /* google refuses indexable text larger than 128k, see https://developers.google.com/drive/file */
					'headers': {
						'Content-Type': 'multipart/mixed; boundary=\'' + boundary + '\''
					},
					'body': multipartRequestBody
				});
			try {
				deferred.notify('sending to Google Drive');
				request.execute(function (resp) {
					var retriable  = [404, 500, 502, 503, 504, -1];
					if (resp.error) {
						if (resp.error.code === 403) {
							if (resp.error.reason && (resp.error.reason === 'rateLimitExceeded' || resp.error.reason === 'userRateLimitExceeded')) {
								deferred.reject('network-error');
							} else {
								deferred.reject('no-access-allowed');
							}
						} else if (resp.error.code === 401) {
							checkAuth(false).then(
								function () {
									saveFile(contentToSave, mapId, fileName).then(deferred.resolve, deferred.reject, deferred.notify);
								},
								deferred.reject,
								deferred.notify
							);
						} else if (_.contains(retriable, resp.error.code)) {
							deferred.reject('network-error');
						} else {
							deferred.reject(resp.error);
						}
					} else {
						deferred.resolve(mindMupId(resp.id), properties);
					}
				});
			} catch (e) {
				deferred.reject('network-error', e.toString() + '\nstack: ' + e.stack + '\nauth: ' + JSON.stringify(gapi.auth.getToken()) + '\nnow: ' + Date.now());
			}
			return deferred.promise();
		},
		downloadFile = function (file) {
			var deferred = jQuery.Deferred();
			if (file.downloadUrl) {
				jQuery.ajax(
					file.downloadUrl,
					{
						progress: deferred.notify,
						headers: {'Authorization': 'Bearer ' + gapi.auth.getToken().access_token }
					}
				).then(
					deferred.resolve,
					deferred.reject.bind(deferred, 'network-error')
				);
			} else {
				deferred.reject('no-file-url');
			}
			return deferred.promise();
		},
		loadFile = function (fileId) {
			var deferred = jQuery.Deferred(),
				request = gapi.client.drive.files.get({
					'fileId': fileId
				});
			request.execute(function (resp) {
				var mimeType = resp.mimeType;
				if (resp.error) {
					if (resp.error.code === 403) {
						deferred.reject('network-error');
					} else if (resp.error.code === 404) {
						deferred.reject('no-access-allowed');
					} else {
						deferred.reject(resp.error);
					}
				} else {
					downloadFile(resp).then(
						function (content) {
							deferred.resolve(content, mimeType);
						},
						deferred.reject,
						deferred.notify
					);
				}
			});
			return deferred.promise();
		},
		authenticate = function (showAuthenticationDialogs) {
			var deferred = jQuery.Deferred(),
				failureReason = showAuthenticationDialogs ? 'failed-authentication' : 'not-authenticated';
			checkAuth(showAuthenticationDialogs).then(deferred.resolve, function () {
				deferred.reject(failureReason);
			}).progress(deferred.notify);
			return deferred.promise();
		},
		loadApi = function (onComplete) {
			if (window.gapi && window.gapi.client) {
				onComplete();
			} else {
				window.googleClientLoaded = onComplete;
				jQuery('<script src="https://apis.google.com/js/client.js?onload=googleClientLoaded"></script>').appendTo('body');
			}
		},
		makeReady = function (showAuthenticationDialogs) {
			var deferred = jQuery.Deferred();
			if (driveLoaded) {
				authenticate(showAuthenticationDialogs).then(deferred.resolve, deferred.reject, deferred.notify);
			} else {
				deferred.notify('Loading Google APIs');
				loadApi(function () {
					deferred.notify('Loading Google Drive APIs');
					gapi.client.setApiKey(apiKey);
					gapi.client.load('drive', 'v2', function () {
						driveLoaded = true;
						authenticate(showAuthenticationDialogs).then(deferred.resolve, deferred.reject, deferred.notify);
					});
				});
			}
			return deferred.promise();
		};
	this.description = 'Google';
	this.saveFile = saveFile;
	this.toGoogleFileId = toGoogleFileId;
	this.ready = function (showAuthenticationDialogs) {
		var deferred = jQuery.Deferred();
		if (driveLoaded && isAuthorised()) {
			deferred.resolve();
		} else {
			makeReady(showAuthenticationDialogs).then(deferred.resolve, deferred.reject, deferred.notify);
		}
		return deferred.promise();
	};

	this.recognises = recognises;

	this.retrieveAllFiles = function (searchCriteria) {
		var deferred = jQuery.Deferred(),
			retrievePageOfFiles = function (request, result) {
				request.execute(function (resp) {
					result = result.concat(resp.items);
					var nextPageToken = resp.nextPageToken;
					if (nextPageToken) {
						request = gapi.client.drive.files.list({
							'pageToken': nextPageToken,
							q: searchCriteria
						});
						retrievePageOfFiles(request, result);
					} else {
						deferred.resolve(result);
					}
				});
			};
		searchCriteria = searchCriteria || 'mimeType = \'' + defaultContentType + '\' and not trashed';
		retrievePageOfFiles(gapi.client.drive.files.list({ 'q': searchCriteria }), []);
		return deferred.promise();
	};

	this.loadMap = function (mapId, showAuthenticationDialogs) {
		var deferred = jQuery.Deferred(),
			googleId = toGoogleFileId(mapId),
			readySucceeded = function () {
				loadFile(googleId).then(
					function (content, mimeType) {
						deferred.resolve(content, mapId, mimeType, properties);
					},
					deferred.reject
				).progress(deferred.notify);
			};
		this.ready(showAuthenticationDialogs).then(readySucceeded, deferred.reject, deferred.notify);
		return deferred.promise();
	};

	this.saveMap = function (contentToSave, mapId, fileName, showAuthenticationDialogs) {
		var deferred = jQuery.Deferred();
		this.ready(showAuthenticationDialogs).then(
			function () {
				saveFile(contentToSave, mapId, fileName).then(deferred.resolve, deferred.reject, deferred.notify);
			},
			deferred.reject
		).progress(deferred.notify);
		return deferred.promise();
	};
	this.showSharingSettings = function (mindMupId) {
		var showDialog = function () {
			var shareClient = new gapi.drive.share.ShareClient(appId);
			shareClient.setItemIds(toGoogleFileId(mindMupId));
			shareClient.showSettingsDialog();
		};
		if (gapi && gapi.drive && gapi.drive.share) {
			showDialog();
		} else {
			this.ready(false).done(function () {
				gapi.load('drive-share', showDialog);
			});
		}
	};
	this.showPicker = function (contentTypes, title) {
		var deferred = jQuery.Deferred(),
			showPicker = function () {
				var picker, view;
				view = new google.picker.View(google.picker.ViewId.DOCS);
				view.setMimeTypes(contentTypes);
				picker = new google.picker.PickerBuilder()
					.enableFeature(google.picker.Feature.NAV_HIDDEN)
					.setAppId(appId)
					.addView(view)
					.setCallback(function (choice) {
						if (choice.action === 'picked') {
							deferred.resolve(mindMupId(choice.docs[0].id));
							return;
						}
						if (choice.action === 'cancel') {
							deferred.reject();
						}
					})
					.setTitle(title)
					.setSelectableMimeTypes(contentTypes)
					.build();
				picker.setVisible(true);
			};
		if (window.google && window.google.picker) {
			showPicker();
		} else {
			this.ready(!isAuthorised()).then(function () {
				gapi.load('picker', showPicker);
			});
		}
		return deferred.promise();
	};
};

