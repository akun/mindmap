/*global $, MM, jQuery, JSON, _, gapi, MAPJS, window, Image, Kinetic, observable */
MM.RealtimeGoogleMapSource = function (googleDriveAdapter) {
	'use strict';
	var nextSessionName,
		properties = {autoSave: true, sharable: true, editable: true, reloadOnSave: true},
		self = observable(this),
		makeRealtimeReady = function (showAuth) {
			var deferred = jQuery.Deferred(),
				loadRealtimeApis = function () {
					if (gapi.drive && gapi.drive.realtime) {
						deferred.resolve();
					} else {
						gapi.load('auth:client,picker,drive-realtime,drive-share', deferred.resolve);
					}
				};
			googleDriveAdapter.ready(showAuth).then(loadRealtimeApis, deferred.reject, deferred.notify);
			return deferred.promise();
		},
		createRealtimeMap = function (name, initialContent, showAuth) {
			var deferred = jQuery.Deferred(),
				fileCreated = function (mindMupId) {
					gapi.drive.realtime.load(googleDriveAdapter.toGoogleFileId(mindMupId),
						function onFileLoaded() {
							deferred.resolve('c' + mindMupId, properties);
						},
						function initializeModel(model) {
							var list = model.createList();
							model.getRoot().set('events', list);
							model.getRoot().set('initialContent', JSON.stringify(initialContent));
						}
						);
				};
			makeRealtimeReady(showAuth).then(
				function () {
					googleDriveAdapter.saveFile('MindMup collaborative session ' + name, undefined, name, 'application/vnd.mindmup.collab').then(
						fileCreated,
						deferred.reject,
						deferred.notify
					);
				},
				deferred.reject,
				deferred.notify
			);
			return deferred.promise();
		};
	this.setNextSessionName = function (name) {
		nextSessionName = name;
	};
	this.loadMap = function loadMap(mindMupId, showAuth) {
		var deferred = jQuery.Deferred(),
			realtimeError = function () {
				deferred.reject('network-error');
				$(window).off('error', realtimeError);
				deferred = undefined;
			},
			initMap = function initMap() {
				try {
					$(window).on('error', realtimeError);
					deferred.notify('Connecting to Google Drive Realtime');
					gapi.drive.realtime.load(
						mindMupId.substr(3),
						function onFileLoaded(doc) {
							deferred.notify('Getting realtime document contents');
							var modelRoot = doc.getModel().getRoot(),
								contentText = modelRoot.get('initialContent'),
								events = modelRoot.get('events'),
								contentAggregate,
								googleSessionId,
								localSessionId,
								applyEvents = function (mindmupEvents, sessionId) {
									mindmupEvents.forEach(function (event) {
										contentAggregate.execCommand(event.cmd, event.args, sessionId);
									});
								},
								onEventAdded = function (event) {
									if (!event.isLocal) {
										applyEvents(event.values, 'gd' + event.sessionId);
										self.dispatchEvent('realtimeDocumentUpdated', event.sessionId);
									}
								},
								onMyJoining = function (collaboratorMe) {
									googleSessionId = collaboratorMe.sessionId;
									localSessionId = 'gd' + googleSessionId;
									deferred.notify('Initializing map from realtime document');
									self.dispatchEvent('realtimeDocumentLoaded', doc, googleSessionId, mindMupId);
									if (!contentText) {
										$(window).off('error', realtimeError);
										deferred.reject('realtime-error', 'Error loading ' + mindMupId + ' content');
										deferred = undefined;
										return;
									}
									contentAggregate = MAPJS.content(JSON.parse(contentText), localSessionId);
									applyEvents(events.asArray(), localSessionId);
									contentAggregate.addEventListener('changed', function (command, params, session) {
										if (session === localSessionId) {
											events.push({cmd: command, args: params});
										}
									});
									events.addEventListener(gapi.drive.realtime.EventType.VALUES_ADDED, onEventAdded);
									deferred.resolve(contentAggregate, mindMupId, properties);
									$(window).off('error', realtimeError);
									deferred = undefined;
								},
								me = _.find(doc.getCollaborators(), function (x) {return x.isMe; });
							if (me) {
								onMyJoining(me);
							} else {
								deferred.notify('Waiting for session to start');
								doc.addEventListener(gapi.drive.realtime.EventType.COLLABORATOR_JOINED, function (event) {
									if (event.collaborator.isMe) {
										onMyJoining(event.collaborator);
									}
								});
							}
						},
						function initializeModel() {
							deferred.reject('realtime-error', 'Session ' + mindMupId + ' has not been initialised');
						},
						function errorHandler(error) {
							if (deferred) {
								if (error && error.type === 'forbidden') {
									deferred.reject('no-access-allowed');
								} else {
									deferred.reject('realtime-error', error.message || error);
								}
							} else {
								if (error.type === gapi.drive.realtime.ErrorType.TOKEN_REFRESH_REQUIRED) {
									self.dispatchEvent('realtimeError', 'Session expired', true);
								} else {
									self.dispatchEvent('realtimeError', error.message || error, error.isFatal);
								}
							}
						}
					);
				} catch (e) {
					deferred.reject(e);
				}
			};
		makeRealtimeReady(showAuth).then(
			initMap,
			deferred.reject,
			deferred.notify
		);
		return deferred.promise();
	};
	this.saveMap = function (map, mapId, showAuth) {
		if (this.recognises(mapId) && mapId.length > 2) {
			return jQuery.Deferred().resolve(mapId, map, properties).promise(); /* no saving needed, realtime updates */
		}
		return createRealtimeMap(nextSessionName, map, showAuth);
	};
	this.description = 'Google Drive Realtime';
	this.recognises = function (mapId) {
		return (/^cg/).test(mapId);
	};
};
MM.Extensions.googleCollaboration = function () {
	'use strict';
	var googleDriveAdapter =  MM.Extensions.components.googleDriveAdapter,
		mapModel = MM.Extensions.components.mapModel,
		alert = MM.Extensions.components.alert,
		realtimeMapSource = new MM.RealtimeGoogleMapSource(googleDriveAdapter),
		mapController = MM.Extensions.components.mapController,
		startSession = function (name) {
			realtimeMapSource.setNextSessionName(name);
			mapController.publishMap('cg');
		},
		KineticSessionManager = function (doc, localSessionId) {
			var sessionImages = {},
				focusNodes = doc.getModel().getRoot().get('focusNodes'),
				followingSessionId,
				self = this,
				getCollaboratorBySession = function (sessionKey) {
					return _.find(doc.getCollaborators(), function (x) { return String(x.sessionId) === String(sessionKey); }) || {};
				},
				makeImage = function (sessionKey) {
					var deferred = jQuery.Deferred(), domImg, kineticImg, collaborator;
					if (sessionImages[sessionKey]) {
						return deferred.resolve(sessionImages[sessionKey]).promise();
					}
					domImg = new Image();
					domImg.onload = function loadImage() {
						sessionImages[sessionKey] = new Kinetic.Image({
							x: 0,
							y: 0,
							image: domImg,
							width: 32,
							height: 32
						});
						sessionImages[sessionKey].on("click tap", function () {
							self.toggleFollow(sessionKey);
						});
						deferred.resolve(sessionImages[sessionKey]);
					};
					collaborator = getCollaboratorBySession(sessionKey);
					if (collaborator.photoUrl) {
						domImg.src = collaborator.photoUrl;
					}
					return deferred.promise();
				},

				onFocusChanged = function (event) {
					if (!event.isLocal) {
						self.showFocus(event.sessionId);
					}
				},
				onCollaboratorLeft = function (event) {
					var profileImg = sessionImages[event.collaborator.sessionId],
						layer;
					alert.show("Collaborator left!", event.collaborator.displayName + " left this session", "flash");
					if (profileImg) {
						layer = profileImg.getLayer();
						profileImg.remove();
						layer.draw();
					}
				},
				onCollaboratorJoined = function (event) {
					alert.show("Collaborator joined!", event.collaborator.displayName + " joined this session", "flash");
				},
				onSelectionChanged = function (id, isSelected) {
					if (isSelected) {
						focusNodes.set(localSessionId, id);
					}
				};
			self.getCollaborators = function () {
				return doc.getCollaborators();
			};
			self.getFollow = function () {
				return followingSessionId;
			};
			self.toggleFollow = function (sessionId) {
				var old = followingSessionId;
				if (followingSessionId !== sessionId) {
					followingSessionId = sessionId;
					alert.show("Following "  + getCollaboratorBySession(sessionId).displayName, "", "flash");
				} else {
					followingSessionId = undefined;
					alert.show("No longer following " + getCollaboratorBySession(sessionId).displayName, "", "flash");
				}
				if (old !== sessionId) {
					self.showFocus(old);
				}
				self.showFocus(sessionId);
			};
			self.showFocus = function (sessionId) {
				if (sessionId === localSessionId) {
					return;
				}
				makeImage(sessionId).done(function (kineticImg) {
					var stage = MM.Extensions.components.container.data('mm-stage'),
						node = stage.get('#node_' + focusNodes.get(sessionId)),
						xpos,
						ypos,
						opacity;
					if (!node || node.length === 0) {
						return;
					}
					xpos = node[0].getWidth() - kineticImg.getWidth() / 2;
					ypos = node[0].getHeight() - kineticImg.getHeight() / 2;
					opacity = (followingSessionId === sessionId) ? 1 : 0.6;
					if (kineticImg.getParent() === node[0] && xpos === kineticImg.getX() && ypos === kineticImg.getY() && opacity === kineticImg.getOpacity()) {
						return;
					}
					kineticImg.remove();
					node[0].add(kineticImg);
					kineticImg.setX(xpos);
					kineticImg.setY(ypos);
					kineticImg.setOpacity(opacity);
					node[0].getLayer().draw();
					if (sessionId === followingSessionId) {
						mapModel.selectNode(focusNodes.get(sessionId));
					}
				});
			};
			self.stop = function () {
				mapModel.removeEventListener('nodeSelectionChanged', onSelectionChanged);
				_.each(sessionImages, function (img) {
					img.remove();
				});
				focusNodes.removeEventListener(gapi.drive.realtime.EventType.VALUE_CHANGED, onFocusChanged);
				doc.removeEventListener(gapi.drive.realtime.EventType.COLLABORATOR_LEFT, onCollaboratorLeft);
				doc.removeEventListener(gapi.drive.realtime.EventType.COLLABORATOR_JOINED, onCollaboratorJoined);
				doc.close();
			};
			if (!focusNodes) {
				focusNodes = doc.getModel().createMap();
				doc.getModel().getRoot().set('focusNodes', focusNodes);
			}
			mapModel.addEventListener('nodeSelectionChanged', onSelectionChanged);
			focusNodes.addEventListener(gapi.drive.realtime.EventType.VALUE_CHANGED, onFocusChanged);
			doc.addEventListener(gapi.drive.realtime.EventType.COLLABORATOR_LEFT, onCollaboratorLeft);
			doc.addEventListener(gapi.drive.realtime.EventType.COLLABORATOR_JOINED, onCollaboratorJoined);
			_.each(doc.getCollaborators(), function (c) { self.showFocus(c.sessionId); });
		},
		kineticSessions,
		loadUI = function (html) {
			var parsed = $(html),
				menu = parsed.find('[data-mm-role=top-menu]').clone().appendTo($('#mainMenu')),
				modal = parsed.find('[data-mm-role=modal-start]').clone().appendTo($('body')),
				collabModal = parsed.find('[data-mm-role=modal-collaborators]').clone().appendTo($('body')),
				sessionNameField = modal.find('input[name=session-name]'),
				saveButton = jQuery('[data-mm-role=publish]'),
				setOnline = function (online) {
					var flag = online ? 'online' : 'offline',
						items = menu.find('[data-mm-collab-visible]');
					items.hide();
					items.filter('[data-mm-collab-visible=' + flag + ']').show();
				},
				initializeSessionFromUi = function () {
					var sessionName = sessionNameField.val();
					if (!sessionName) {
						sessionNameField.parent().addClass('error');
						return false;
					}
					modal.modal('hide');
					startSession(sessionName);
					return false;
				},
				collabLinkTemplate = collabModal.find('[data-mm-role=template]').clone();
			$('#mainMenu').find('[data-mm-role=optional]').hide();
			menu.find('[data-mm-role=start]').click(function () {
				sessionNameField.val('');
				sessionNameField.parent().removeClass('error');
				modal.modal('show');
			});
			modal.on('shown', function () {
				sessionNameField.focus();
			});
			menu.find('[data-mm-role=invite]').click(function () {
				var mapId = mapController.currentMapId();
				if (realtimeMapSource.recognises(mapId)) {
					googleDriveAdapter.showSharingSettings(mapId.substr(1));
				}
			});
			$('[data-mm-role=sharelinks]').append(menu.find('[data-mm-role=invite]').parent('li').clone(true).addClass('visible-map-source-c'));
			menu.find('[data-mm-role=join]').click(function () {
				googleDriveAdapter.showPicker('application/vnd.mindmup.collab', 'Choose a realtime session').done(function (id) {
					mapController.loadMap('c' + id);
				});
			});
			menu.find('[data-mm-role=leave]').click(function () {
				mapController.loadMap('new-g');
			});
			modal.find('[data-mm-role=start-session]').click(initializeSessionFromUi);
			modal.find('form').submit(initializeSessionFromUi);

			mapController.addEventListener('mapLoaded mapSaved', function (mapId) {
				setOnline(realtimeMapSource.recognises(mapId));
			});
			menu.find('[data-mm-role=show-collaborators]').click(function () {
				var list = collabModal.find('[data-mm-role=collab-list]');
				list.empty();
				_.each(kineticSessions.getCollaborators(), function (c) {
					var item = collabLinkTemplate.clone().appendTo(list).show();
					item.find('[data-mm-role=collaborator-name]').text(c.isAnonymous ? "Anonymous" : c.displayName);
					item.find('[data-mm-role=collaborator-photo]').attr('src', c.photoUrl);
					if (!c.isMe) {
						if (c.sessionId === kineticSessions.getFollow()) {
							item.find('[data-mm-role=collaborator-notes]').text('(Following)');
						}
						item.find('[data-mm-role=collaborator-select]').attr('href', '#').click(function () {
							collabModal.modal('hide');
							kineticSessions.toggleFollow(c.sessionId);
							return false;
						});
					} else {
						item.find('[data-mm-role=collaborator-notes]').text('(You)');
					}
				});
				collabModal.modal('show');
			});
			realtimeMapSource.addEventListener("realtimeDocumentLoaded", function (doc, googleSessionId) {
				doc.addEventListener(gapi.drive.realtime.EventType.DOCUMENT_SAVE_STATE_CHANGED, function (docState) {
					if (docState.isPending || docState.isSaving) {
						if (!$('i[class="icon-spinner icon-spin"]', saveButton).length) {
							saveButton.prepend('<i class="icon-spinner icon-spin"></i>');
						}
					} else {
						$('i[class="icon-spinner icon-spin"]', saveButton).remove();
					}
				});
			});
		};
	mapController.addMapSource(new MM.RetriableMapSourceDecorator(realtimeMapSource));
	realtimeMapSource.addEventListener("realtimeDocumentLoaded", function (doc, googleSessionId, mindMupId) {
		kineticSessions = new KineticSessionManager(doc, googleSessionId);
		kineticSessions.mapId = mindMupId;
	});
	mapController.addEventListener('mapLoaded mapSaved', function (mapId) {
		if (kineticSessions && kineticSessions.mapId !== mapId) {
			kineticSessions.stop();
			kineticSessions = undefined;
		}
	});
	realtimeMapSource.addEventListener("realtimeDocumentUpdated", function (googleSessionId) {
		if (kineticSessions) {
			kineticSessions.showFocus(googleSessionId);
		}
	});
	realtimeMapSource.addEventListener("realtimeError", function (errorMessage, isFatal) {
		if (isFatal) {
			alert.show('Network error: ' + errorMessage + '!', 'Please refresh the page before changing the map any further, your updates might not be saved', 'error');
		} else {
			alert.show('Network error: ' + errorMessage + '!', 'If the error persists, please refresh the page', 'flash');
		}
	});
	$.get('/' + MM.Extensions.mmConfig.cachePreventionKey + '/e/google-collaboration.html', loadUI);
	$('<link rel="stylesheet" href="/' + MM.Extensions.mmConfig.cachePreventionKey + '/e/google-collaboration.css" />').appendTo($('body'));
};
MM.Extensions.googleCollaboration();
