var MAPJS = {};
var observable = function (base) {
	'use strict';
	var listeners = [];
	base.addEventListener = function (types, listener, priority) {
		types.split(' ').forEach(function (type) {
			if (type) {
				listeners.push({
					type: type,
					listener: listener,
					priority: priority || 0
				});
			}
		});
	};
	base.listeners = function (type) {
		return listeners.filter(function (listenerDetails) {
			return listenerDetails.type === type;
		}).map(function (listenerDetails) {
			return listenerDetails.listener;
		});
	};
	base.removeEventListener = function (type, listener) {
		listeners = listeners.filter(function (details) {
			return details.listener !== listener;
		});
	};
	base.dispatchEvent = function (type) {
		var args = Array.prototype.slice.call(arguments, 1);
		listeners
			.filter(function (listenerDetails) {
				return listenerDetails.type === type;
			})
			.sort(function (firstListenerDetails, secondListenerDetails) {
				return secondListenerDetails.priority - firstListenerDetails.priority;
			})
			.some(function (listenerDetails) {
				return listenerDetails.listener.apply(undefined, args) === false;
			});
	};
	return base;
};
/*global MAPJS */
MAPJS.URLHelper = {
	urlPattern: /(https?:\/\/|www\.)[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/i,
	containsLink : function (text) {
		'use strict';
		return MAPJS.URLHelper.urlPattern.test(text);
	},
	getLink : function (text) {
		'use strict';
		var url = text.match(MAPJS.URLHelper.urlPattern);
		if (url && url[0]) {
			url = url[0];
			if (!/https?:\/\//i.test(url)) {
				url = 'http://' + url;
			}
		}
		return url;
	},
	stripLink : function (text) {
		'use strict';
		return text.replace(MAPJS.URLHelper.urlPattern, '');
	}
};
/*jslint eqeq: true, forin: true, nomen: true*/
/*global _, MAPJS, observable*/
MAPJS.content = function (contentAggregate, sessionKey) {
	'use strict';
	var cachedId,
		invalidateIdCache = function () {
			cachedId = undefined;
		},
		maxId = function maxId(idea) {
			idea = idea || contentAggregate;
			if (!idea.ideas) {
				return parseInt(idea.id, 10) || 0;
			}
			return _.reduce(
				idea.ideas,
				function (result, subidea) {
					return Math.max(result, maxId(subidea));
				},
				parseInt(idea.id, 10) || 0
			);
		},
		nextId = function nextId(originSession) {
			originSession = originSession || sessionKey;
			if (!cachedId) {
				cachedId =  maxId();
			}
			cachedId += 1;
			if (originSession) {
				return cachedId + '.' + originSession;
			}
			return cachedId;
		},
		init = function (contentIdea, originSession) {
			if (!contentIdea.id) {
				contentIdea.id = nextId(originSession);
			} else {
				invalidateIdCache();
			}
			if (contentIdea.ideas) {
				_.each(contentIdea.ideas, function (value, key) {
					contentIdea.ideas[parseFloat(key)] = init(value, originSession);
				});
			}
			if (!contentIdea.title) {
				contentIdea.title = '';
			}
			contentIdea.containsDirectChild = contentIdea.findChildRankById = function (childIdeaId) {
				return parseFloat(
					_.reduce(
						contentIdea.ideas,
						function (res, value, key) {
							return value.id == childIdeaId ? key : res;
						},
						undefined
					)
				);
			};
			contentIdea.findSubIdeaById = function (childIdeaId) {
				var myChild = _.find(contentIdea.ideas, function (idea) {
					return idea.id == childIdeaId;
				});
				return myChild || _.reduce(contentIdea.ideas, function (result, idea) {
					return result || idea.findSubIdeaById(childIdeaId);
				}, undefined);
			};
			contentIdea.find = function (predicate) {
				var current = predicate(contentIdea) ? [_.pick(contentIdea, 'id', 'title')] : [];
				if (_.size(contentIdea.ideas) === 0) {
					return current;
				}
				return _.reduce(contentIdea.ideas, function (result, idea) {
					return _.union(result, idea.find(predicate));
				}, current);
			};
			contentIdea.getAttr = function (name) {
				if (contentIdea.attr && contentIdea.attr[name]) {
					return contentIdea.attr[name];
				}
				return false;
			};
			contentIdea.sortedSubIdeas = function () {
				if (!contentIdea.ideas) {
					return [];
				}
				var result = [],
					childKeys = _.groupBy(_.map(_.keys(contentIdea.ideas), parseFloat), function (key) { return key > 0; }),
					sortedChildKeys = _.sortBy(childKeys[true], Math.abs).concat(_.sortBy(childKeys[false], Math.abs));
				_.each(sortedChildKeys, function (key) {
					result.push(contentIdea.ideas[key]);
				});
				return result;
			};
			return contentIdea;
		},
		maxKey = function (kvMap, sign) {
			sign = sign || 1;
			if (_.size(kvMap) === 0) {
				return 0;
			}
			var currentKeys = _.keys(kvMap);
			currentKeys.push(0); /* ensure at least 0 is there for negative ranks */
			return _.max(_.map(currentKeys, parseFloat), function (x) {
				return x * sign;
			});
		},
		nextChildRank = function (parentIdea) {
			var newRank, counts, childRankSign = 1;
			if (parentIdea.id == contentAggregate.id) {
				counts = _.countBy(parentIdea.ideas, function (v, k) {
					return k < 0;
				});
				if ((counts['true'] || 0) < counts['false']) {
					childRankSign = -1;
				}
			}
			newRank = maxKey(parentIdea.ideas, childRankSign) + childRankSign;
			return newRank;
		},
		appendSubIdea = function (parentIdea, subIdea) {
			var rank;
			parentIdea.ideas = parentIdea.ideas || {};
			rank = nextChildRank(parentIdea);
			parentIdea.ideas[rank] = subIdea;
			return rank;
		},
		findIdeaById = function (ideaId) {
			return contentAggregate.id == ideaId ? contentAggregate : contentAggregate.findSubIdeaById(ideaId);
		},
		sameSideSiblingRanks = function (parentIdea, ideaRank) {
			return _(_.map(_.keys(parentIdea.ideas), parseFloat)).reject(function (k) {return k * ideaRank < 0; });
		},
		sign = function (number) {
			/* intentionally not returning 0 case, to help with split sorting into 2 groups */
			return number < 0 ? -1 : 1;
		},
		eventStacks = {},
		redoStacks = {},
		isRedoInProgress = false,
		batches = {},
		notifyChange = function (method, args, originSession) {
			if (originSession) {
				contentAggregate.dispatchEvent('changed', method, args, originSession);
			} else {
				contentAggregate.dispatchEvent('changed', method, args);
			}
		},
		logChange = function (method, args, undofunc, originSession) {
			var event = {eventMethod: method, eventArgs: args, undoFunction: undofunc};
			if (batches[originSession]) {
				batches[originSession].push(event);
				return;
			}
			if (!eventStacks[originSession]) {
				eventStacks[originSession] = [];
			}
			eventStacks[originSession].push(event);

			if (isRedoInProgress) {
				contentAggregate.dispatchEvent('changed', 'redo', undefined, originSession);
			} else {
				notifyChange(method, args, originSession);
				redoStacks[originSession] = [];
			}
		},
		reorderChild = function (parentIdea, newRank, oldRank) {
			parentIdea.ideas[newRank] = parentIdea.ideas[oldRank];
			delete parentIdea.ideas[oldRank];
		},
		upgrade = function (idea) {
			if (idea.style) {
				idea.attr = {};
				var collapsed = idea.style.collapsed;
				delete idea.style.collapsed;
				idea.attr.style = idea.style;
				if (collapsed) {
					idea.attr.collapsed = collapsed;
				}
				delete idea.style;
			}
			if (idea.ideas) {
				_.each(idea.ideas, upgrade);
			}
		},
		sessionFromId = function (id) {
			var dotIndex = String(id).indexOf('.');
			return dotIndex > 0 && id.substr(dotIndex + 1);
		},
		commandProcessors = {};
	contentAggregate.getSessionKey = function () {
		return sessionKey;
	};
	contentAggregate.nextSiblingId = function (subIdeaId) {
		var parentIdea = contentAggregate.findParent(subIdeaId),
			currentRank,
			candidateSiblingRanks,
			siblingsAfter;
		if (!parentIdea) { return false; }
		currentRank = parentIdea.findChildRankById(subIdeaId);
		candidateSiblingRanks = sameSideSiblingRanks(parentIdea, currentRank);
		siblingsAfter = _.reject(candidateSiblingRanks, function (k) { return Math.abs(k) <= Math.abs(currentRank); });
		if (siblingsAfter.length === 0) { return false; }
		return parentIdea.ideas[_.min(siblingsAfter, Math.abs)].id;
	};
	contentAggregate.getAttrById = function (ideaId, attrName) {
		var idea = findIdeaById(ideaId);
		return idea && idea.getAttr(attrName);
	};
	contentAggregate.previousSiblingId = function (subIdeaId) {
		var parentIdea = contentAggregate.findParent(subIdeaId),
			currentRank,
			candidateSiblingRanks,
			siblingsBefore;
		if (!parentIdea) { return false; }
		currentRank = parentIdea.findChildRankById(subIdeaId);
		candidateSiblingRanks = sameSideSiblingRanks(parentIdea, currentRank);
		siblingsBefore = _.reject(candidateSiblingRanks, function (k) { return Math.abs(k) >= Math.abs(currentRank); });
		if (siblingsBefore.length === 0) { return false; }
		return parentIdea.ideas[_.max(siblingsBefore, Math.abs)].id;
	};
	contentAggregate.clone = function (subIdeaId) {
		var toClone = (subIdeaId && subIdeaId != contentAggregate.id && contentAggregate.findSubIdeaById(subIdeaId)) || contentAggregate;
		return JSON.parse(JSON.stringify(toClone));
	};
	contentAggregate.calculatePath = function (ideaId, currentPath, potentialParent) {
		if (contentAggregate.id == ideaId) {
			return [];
		}
		currentPath = currentPath || [contentAggregate];
		potentialParent = potentialParent || contentAggregate;
		if (potentialParent.containsDirectChild(ideaId)) {
			return currentPath;
		}
		return _.reduce(
			potentialParent.ideas,
			function (result, child) {
				return result || contentAggregate.calculatePath(ideaId, [child].concat(currentPath), child);
			},
			false
		);
	};
	contentAggregate.getSubTreeIds = function (rootIdeaId) {
		var result = [],
			collectIds = function (idea) {
				if (_.isEmpty(idea.ideas)) {
					return [];
				}
				_.each(idea.sortedSubIdeas(), function (child) {
					collectIds(child);
					result.push(child.id);
				});
			};
		collectIds(contentAggregate.findSubIdeaById(rootIdeaId) || contentAggregate);
		return result;
	};
	contentAggregate.findParent = function (subIdeaId, parentIdea) {
		parentIdea = parentIdea || contentAggregate;
		if (parentIdea.containsDirectChild(subIdeaId)) {
			return parentIdea;
		}
		return _.reduce(
			parentIdea.ideas,
			function (result, child) {
				return result || contentAggregate.findParent(subIdeaId, child);
			},
			false
		);
	};

	/**** aggregate command processing methods ****/
	contentAggregate.startBatch = function (originSession) {
		var activeSession = originSession || sessionKey;
		contentAggregate.endBatch(originSession);
		batches[activeSession] = [];
	};
	contentAggregate.endBatch = function (originSession) {
		var activeSession = originSession || sessionKey,
			inBatch = batches[activeSession],
			batchArgs,
			batchUndoFunctions,
			undo;
		batches[activeSession] = undefined;
		if (_.isEmpty(inBatch)) {
			return;
		}
		if (_.size(inBatch) === 1) {
			logChange(inBatch[0].eventMethod, inBatch[0].eventArgs, inBatch[0].undoFunction, activeSession);
		} else {
			batchArgs = _.map(inBatch, function (event) {
				return [event.eventMethod].concat(event.eventArgs);
			});
			batchUndoFunctions = _.sortBy(
				_.map(inBatch, function (event) { return event.undoFunction; }),
				function (f, idx) { return -1 * idx; }
			);
			undo = function () {
				_.each(batchUndoFunctions, function (eventUndo) {
					eventUndo();
				});
			};
			logChange('batch', batchArgs, undo, activeSession);
		}
	};
	contentAggregate.execCommand = function (cmd, args, originSession) {
		if (!commandProcessors[cmd]) {
			return false;
		}
		return commandProcessors[cmd].apply(contentAggregate, [originSession || sessionKey].concat(_.toArray(args)));
	};

	contentAggregate.batch = function (batchOp) {
		contentAggregate.startBatch();
		try {
			batchOp();
		}
		finally {
			contentAggregate.endBatch();
		}
	};

	commandProcessors.batch = function (originSession) {
		contentAggregate.startBatch(originSession);
		try {
			_.each(_.toArray(arguments).slice(1), function (event) {
				contentAggregate.execCommand(event[0], event.slice(1), originSession);
			});
		}
		finally {
			contentAggregate.endBatch(originSession);
		}
	};
	contentAggregate.paste = function (parentIdeaId, jsonToPaste, initialId) {
		return contentAggregate.execCommand('paste', arguments);
	};
	commandProcessors.paste = function (originSession, parentIdeaId, jsonToPaste, initialId) {
		var pasteParent = (parentIdeaId == contentAggregate.id) ?  contentAggregate : contentAggregate.findSubIdeaById(parentIdeaId),
			cleanUp = function (json) {
				var result =  _.omit(json, 'ideas', 'id'), index = 1, childKeys, sortedChildKeys;
				if (json.ideas) {
					childKeys = _.groupBy(_.map(_.keys(json.ideas), parseFloat), function (key) { return key > 0; });
					sortedChildKeys = _.sortBy(childKeys[true], Math.abs).concat(_.sortBy(childKeys[false], Math.abs));
					result.ideas = {};
					_.each(sortedChildKeys, function (key) {
						result.ideas[index++] = cleanUp(json.ideas[key]);
					});
				}
				return result;
			},
			newIdea,
			newRank;
		if (initialId) {
			cachedId = parseInt(initialId, 10) - 1;
		}
		newIdea =  jsonToPaste && jsonToPaste.title && init(cleanUp(jsonToPaste), sessionFromId(initialId));
		if (!pasteParent || !newIdea) {
			return false;
		}
		newRank = appendSubIdea(pasteParent, newIdea);
		if (initialId) {
			invalidateIdCache();
		}
		logChange('paste', [parentIdeaId, jsonToPaste, newIdea.id], function () {
			delete pasteParent.ideas[newRank];
		}, originSession);
		return true;
	};
	contentAggregate.flip = function (ideaId) {
		return contentAggregate.execCommand('flip', arguments);
	};
	commandProcessors.flip = function (originSession, ideaId) {
		var newRank, maxRank, currentRank = contentAggregate.findChildRankById(ideaId);
		if (!currentRank) {
			return false;
		}
		maxRank = maxKey(contentAggregate.ideas, -1 * sign(currentRank));
		newRank = maxRank - 10 * sign(currentRank);
		reorderChild(contentAggregate, newRank, currentRank);
		logChange('flip', [ideaId], function () {
			reorderChild(contentAggregate, currentRank, newRank);
		}, originSession);
		return true;
	};
	contentAggregate.updateTitle = function (ideaId, title) {
		return contentAggregate.execCommand('updateTitle', arguments);
	};
	commandProcessors.updateTitle = function (originSession, ideaId, title) {
		var idea = findIdeaById(ideaId), originalTitle;
		if (!idea) {
			return false;
		}
		originalTitle = idea.title;
		if (originalTitle == title) {
			return false;
		}
		idea.title = title;
		logChange('updateTitle', [ideaId, title], function () {
			idea.title = originalTitle;
		}, originSession);
		return true;
	};
	contentAggregate.addSubIdea = function (parentId, ideaTitle, optionalNewId) {
		return contentAggregate.execCommand('addSubIdea', arguments);
	};
	commandProcessors.addSubIdea = function (originSession, parentId, ideaTitle, optionalNewId) {
		var idea, parent = findIdeaById(parentId), newRank;
		if (!parent) {
			return false;
		}
		if (optionalNewId && findIdeaById(optionalNewId)) {
			return false;
		}
		idea = init({
			title: ideaTitle,
			id: optionalNewId
		});
		newRank = appendSubIdea(parent, idea);
		logChange('addSubIdea', [parentId, ideaTitle, idea.id], function () {
			delete parent.ideas[newRank];
		}, originSession);
		return idea.id;
	};
	contentAggregate.removeSubIdea = function (subIdeaId) {
		return contentAggregate.execCommand('removeSubIdea', arguments);
	};
	commandProcessors.removeSubIdea = function (originSession, subIdeaId) {
		var parent = contentAggregate.findParent(subIdeaId), oldRank, oldIdea, oldLinks;
		if (parent) {
			oldRank = parent.findChildRankById(subIdeaId);
			oldIdea = parent.ideas[oldRank];
			delete parent.ideas[oldRank];
			oldLinks = contentAggregate.links;
			contentAggregate.links = _.reject(contentAggregate.links, function (link) { return link.ideaIdFrom == subIdeaId || link.ideaIdTo == subIdeaId; });
			logChange('removeSubIdea', [subIdeaId], function () {
				parent.ideas[oldRank] = oldIdea;
				contentAggregate.links = oldLinks;
			}, originSession);
			return true;
		}
		return false;
	};
	contentAggregate.insertIntermediate = function (inFrontOfIdeaId, title, optionalNewId) {
		return contentAggregate.execCommand('insertIntermediate', arguments);
	};
	commandProcessors.insertIntermediate = function (originSession, inFrontOfIdeaId, title, optionalNewId) {
		if (contentAggregate.id == inFrontOfIdeaId) {
			return false;
		}
		var childRank, oldIdea, newIdea, parentIdea = contentAggregate.findParent(inFrontOfIdeaId);
		if (!parentIdea) {
			return false;
		}
		if (optionalNewId && findIdeaById(optionalNewId)) {
			return false;
		}
		childRank = parentIdea.findChildRankById(inFrontOfIdeaId);
		if (!childRank) {
			return false;
		}
		oldIdea = parentIdea.ideas[childRank];
		newIdea = init({
			title: title,
			id: optionalNewId
		});
		parentIdea.ideas[childRank] = newIdea;
		newIdea.ideas = {
			1: oldIdea
		};
		logChange('insertIntermediate', [inFrontOfIdeaId, title, newIdea.id], function () {
			parentIdea.ideas[childRank] = oldIdea;
		}, originSession);
		return true;
	};
	contentAggregate.changeParent = function (ideaId, newParentId) {
		return contentAggregate.execCommand('changeParent', arguments);
	};
	commandProcessors.changeParent = function (originSession, ideaId, newParentId) {
		var oldParent, oldRank, newRank, idea, parent = findIdeaById(newParentId);
		if (ideaId == newParentId) {
			return false;
		}
		if (!parent) {
			return false;
		}
		idea = contentAggregate.findSubIdeaById(ideaId);
		if (!idea) {
			return false;
		}
		if (idea.findSubIdeaById(newParentId)) {
			return false;
		}
		if (parent.containsDirectChild(ideaId)) {
			return false;
		}
		oldParent = contentAggregate.findParent(ideaId);
		if (!oldParent) {
			return false;
		}
		oldRank = oldParent.findChildRankById(ideaId);
		newRank = appendSubIdea(parent, idea);
		delete oldParent.ideas[oldRank];
		logChange('changeParent', [ideaId, newParentId], function () {
			oldParent.ideas[oldRank] = idea;
			delete parent.ideas[newRank];
		}, originSession);
		return true;
	};
	var updateAttr = function (object, attrName, attrValue) {
		var oldAttr;
		if (!object) {
			return false;
		}
		oldAttr = _.extend({}, object.attr);
		object.attr = _.extend({}, object.attr);
		if (!attrValue || attrValue === 'false') {
			if (!object.attr[attrName]) {
				return false;
			}
			delete object.attr[attrName];
		} else {
			if (_.isEqual(object.attr[attrName], attrValue)) {
				return false;
			}
			object.attr[attrName] = JSON.parse(JSON.stringify(attrValue));
		}
		if (_.size(object.attr) === 0) {
			delete object.attr;
		}
		return function () {
			object.attr = oldAttr;
		};
	};
	contentAggregate.updateAttr = function (ideaId, attrName, attrValue) {
		return contentAggregate.execCommand('updateAttr', arguments);
	};
	commandProcessors.updateAttr = function (originSession, ideaId, attrName, attrValue) {
		var idea = findIdeaById(ideaId), undoAction;
		undoAction = updateAttr(idea, attrName, attrValue);
		if (undoAction) {
			logChange('updateAttr', [ideaId, attrName, attrValue], undoAction, originSession);
		}
		return !!undoAction;
	};
	contentAggregate.moveRelative = function (ideaId, relativeMovement) {
		var parentIdea = contentAggregate.findParent(ideaId),
			currentRank = parentIdea && parentIdea.findChildRankById(ideaId),
			siblingRanks = currentRank && _.sortBy(sameSideSiblingRanks(parentIdea, currentRank), Math.abs),
			currentIndex = siblingRanks && siblingRanks.indexOf(currentRank),
			/* we call positionBefore, so movement down is actually 2 spaces, not 1 */
			newIndex = currentIndex + (relativeMovement > 0 ? relativeMovement + 1 : relativeMovement),
			beforeSibling = (newIndex >= 0) && parentIdea && siblingRanks && parentIdea.ideas[siblingRanks[newIndex]];
		if (newIndex < 0 || !parentIdea) {
			return false;
		}
		return contentAggregate.positionBefore(ideaId, beforeSibling && beforeSibling.id, parentIdea);
	};
	contentAggregate.positionBefore = function (ideaId, positionBeforeIdeaId, parentIdea) {
		return contentAggregate.execCommand('positionBefore', arguments);
	};
	commandProcessors.positionBefore = function (originSession, ideaId, positionBeforeIdeaId, parentIdea) {
		parentIdea = parentIdea || contentAggregate;
		var newRank, afterRank, siblingRanks, candidateSiblings, beforeRank, maxRank, currentRank;
		currentRank = parentIdea.findChildRankById(ideaId);
		if (!currentRank) {
			return _.reduce(
				parentIdea.ideas,
				function (result, idea) {
					return result || commandProcessors.positionBefore(originSession, ideaId, positionBeforeIdeaId, idea);
				},
				false
			);
		}
		if (ideaId == positionBeforeIdeaId) {
			return false;
		}
		newRank = 0;
		if (positionBeforeIdeaId) {
			afterRank = parentIdea.findChildRankById(positionBeforeIdeaId);
			if (!afterRank) {
				return false;
			}
			siblingRanks = sameSideSiblingRanks(parentIdea, currentRank);
			candidateSiblings = _.reject(_.sortBy(siblingRanks, Math.abs), function (k) {
				return Math.abs(k) >= Math.abs(afterRank);
			});
			beforeRank = candidateSiblings.length > 0 ? _.max(candidateSiblings, Math.abs) : 0;
			if (beforeRank == currentRank) {
				return false;
			}
			newRank = beforeRank + (afterRank - beforeRank) / 2;
		} else {
			maxRank = maxKey(parentIdea.ideas, currentRank < 0 ? -1 : 1);
			if (maxRank == currentRank) {
				return false;
			}
			newRank = maxRank + 10 * (currentRank < 0 ? -1 : 1);
		}
		if (newRank == currentRank) {
			return false;
		}
		reorderChild(parentIdea, newRank, currentRank);
		logChange('positionBefore', [ideaId, positionBeforeIdeaId], function () {
			reorderChild(parentIdea, currentRank, newRank);
		}, originSession);
		return true;
	};
	observable(contentAggregate);
	(function () {
		var isLinkValid = function (ideaIdFrom, ideaIdTo) {
			var isParentChild, ideaFrom, ideaTo;
			if (ideaIdFrom === ideaIdTo) {
				return false;
			}
			ideaFrom = findIdeaById(ideaIdFrom);
			if (!ideaFrom) {
				return false;
			}
			ideaTo = findIdeaById(ideaIdTo);
			if (!ideaTo) {
				return false;
			}
			isParentChild = _.find(
				ideaFrom.ideas,
				function (node) {
					return node.id === ideaIdTo;
				}
			) || _.find(
				ideaTo.ideas,
				function (node) {
					return node.id === ideaIdFrom;
				}
			);
			if (isParentChild) {
				return false;
			}
			return true;
		};
		contentAggregate.addLink = function (ideaIdFrom, ideaIdTo) {
			return contentAggregate.execCommand('addLink', arguments);
		};
		commandProcessors.addLink = function (originSession, ideaIdFrom, ideaIdTo) {
			var alreadyExists, link;
			if (!isLinkValid(ideaIdFrom, ideaIdTo)) {
				return false;
			}
			alreadyExists = _.find(
				contentAggregate.links,
				function (link) {
					return (link.ideaIdFrom === ideaIdFrom && link.ideaIdTo === ideaIdTo) || (link.ideaIdFrom === ideaIdTo && link.ideaIdTo === ideaIdFrom);
				}
			);
			if (alreadyExists) {
				return false;
			}
			contentAggregate.links = contentAggregate.links || [];
			link = {
				ideaIdFrom: ideaIdFrom,
				ideaIdTo: ideaIdTo,
				attr: {
					style: {
						color: '#FF0000',
						lineStyle: 'dashed'
					}
				}
			};
			contentAggregate.links.push(link);
			logChange('addLink', [ideaIdFrom, ideaIdTo], function () {
				contentAggregate.links.pop();
			}, originSession);
			return true;
		};
		contentAggregate.removeLink = function (ideaIdOne, ideaIdTwo) {
			return contentAggregate.execCommand('removeLink', arguments);
		};
		commandProcessors.removeLink = function (originSession, ideaIdOne, ideaIdTwo) {
			var i = 0, link;
			while (contentAggregate.links && i < contentAggregate.links.length) {
				link = contentAggregate.links[i];
				if (String(link.ideaIdFrom) === String(ideaIdOne) && String(link.ideaIdTo) === String(ideaIdTwo)) {
					contentAggregate.links.splice(i, 1);
					logChange('removeLink', [ideaIdOne, ideaIdTwo], function () {
						contentAggregate.links.push(_.clone(link));
					}, originSession);
					return true;
				}
				i += 1;
			}
			return false;
		};
		contentAggregate.getLinkAttr = function (ideaIdFrom, ideaIdTo, name) {
			var link = _.find(
				contentAggregate.links,
				function (link) {
					return link.ideaIdFrom == ideaIdFrom && link.ideaIdTo == ideaIdTo;
				}
			);
			if (link && link.attr && link.attr[name]) {
				return link.attr[name];
			}
			return false;
		};
		contentAggregate.updateLinkAttr = function (ideaIdFrom, ideaIdTo, attrName, attrValue) {
			return contentAggregate.execCommand('updateLinkAttr', arguments);
		};
		commandProcessors.updateLinkAttr = function (originSession, ideaIdFrom, ideaIdTo, attrName, attrValue) {
			var link = _.find(
				contentAggregate.links,
				function (link) {
					return link.ideaIdFrom == ideaIdFrom && link.ideaIdTo == ideaIdTo;
				}
			), undoAction;
			undoAction = updateAttr(link, attrName, attrValue);
			if (undoAction) {
				logChange('updateLinkAttr', [ideaIdFrom, ideaIdTo, attrName, attrValue], undoAction, originSession);
			}
			return !!undoAction;
		};
	}());
	/* undo/redo */
	contentAggregate.undo = function () {
		return contentAggregate.execCommand('undo', arguments);
	};
	commandProcessors.undo = function (originSession) {
		contentAggregate.endBatch();
		var topEvent;
		topEvent = eventStacks[originSession] && eventStacks[originSession].pop();
		if (topEvent && topEvent.undoFunction) {
			topEvent.undoFunction();
			if (!redoStacks[originSession]) {
				redoStacks[originSession] = [];
			}
			redoStacks[originSession].push(topEvent);
			contentAggregate.dispatchEvent('changed', 'undo', [], originSession);
			return true;
		}
		return false;
	};
	contentAggregate.redo = function () {
		return contentAggregate.execCommand('redo', arguments);
	};
	commandProcessors.redo = function (originSession) {
		contentAggregate.endBatch();
		var topEvent;
		topEvent = redoStacks[originSession] && redoStacks[originSession].pop();
		if (topEvent) {
			isRedoInProgress = true;
			contentAggregate.execCommand(topEvent.eventMethod, topEvent.eventArgs, originSession);
			isRedoInProgress = false;
			return true;
		}
		return false;
	};
	if (contentAggregate.formatVersion != 2) {
		upgrade(contentAggregate);
		contentAggregate.formatVersion = 2;
	}
	init(contentAggregate);
	return contentAggregate;
};
/*jslint nomen: true*/
/*global _, Color, MAPJS*/
(function () {
	'use strict';
	MAPJS.calculateDimensions = function calculateDimensions(idea, dimensionProvider, margin) {
		var dimensions = dimensionProvider(idea.title),
			result = _.extend(_.pick(idea, ['id', 'title', 'attr']), {
				width: dimensions.width + 2 * margin,
				height: dimensions.height + 2 * margin
			}),
			leftOrRight,
			subIdeaWidths = [0, 0],
			subIdeaHeights = [0, 0],
			subIdeaRank,
			subIdea,
			subIdeaDimensions;
		if (idea.ideas && !idea.getAttr('collapsed')) {
			result.ideas = {};
			for (subIdeaRank in idea.ideas) {
				subIdea = idea.ideas[subIdeaRank];
				subIdeaDimensions = calculateDimensions(subIdea, dimensionProvider, margin);
				result.ideas[subIdeaRank] = subIdeaDimensions;
				leftOrRight = subIdeaRank > 0 ? 1 : 0;
				subIdeaWidths[leftOrRight] = Math.max(subIdeaWidths[leftOrRight], subIdeaDimensions.Width);
				subIdeaHeights[leftOrRight] += subIdeaDimensions.Height;
			}
		}
		result.WidthLeft = subIdeaWidths[0] || 0;
		result.Width = result.width + subIdeaWidths[0] + subIdeaWidths[1];
		result.Height = Math.max(result.height, subIdeaHeights[0], subIdeaHeights[1]);
		return result;
	};
	MAPJS.calculatePositions = function calculatePositions(idea, dimensionProvider, margin, x0, y0, result, isLeftSubtree) {
		var ranks,
			subIdeaRank,
			i,
			subIdeaDimensions,
			leftOrRight,
			totalHeights = [0, 0],
			subIdeaCurrentY0 = [y0, y0];
		result = result || MAPJS.calculateDimensions(idea, dimensionProvider, margin);
		x0 += result.WidthLeft;
		result.x = x0 + margin;
		result.y = y0 + 0.5 * (result.Height - result.height) + margin;
		if (result.ideas) {
			ranks = [];
			for (subIdeaRank in result.ideas) {
				ranks.push(parseFloat(subIdeaRank));
				subIdeaDimensions = result.ideas[subIdeaRank];
				if (isLeftSubtree) {
					subIdeaRank = -subIdeaRank;
				}
				totalHeights[subIdeaRank < 0 ? 0 : 1] += subIdeaDimensions.Height;
			}
			subIdeaCurrentY0[0] += 0.5 * (result.Height - totalHeights[0]);
			subIdeaCurrentY0[1] += 0.5 * (result.Height - totalHeights[1]);
			ranks.sort(function ascending(firstRank, secondRank) {
				if (firstRank >= 0 && secondRank >= 0) {
					return secondRank - firstRank;
				}
				if (firstRank < 0 && secondRank < 0) {
					return firstRank - secondRank;
				}
				return secondRank - firstRank;
			});
			for (i = ranks.length - 1; i >= 0; i -= 1) {
				subIdeaRank = ranks[i];
				subIdeaDimensions = result.ideas[subIdeaRank];
				if (isLeftSubtree) {
					subIdeaRank = -subIdeaRank;
				}
				leftOrRight = subIdeaRank > 0 ? 1 : 0;
				calculatePositions(undefined, dimensionProvider, margin, x0 + (leftOrRight ? result.width : -subIdeaDimensions.width), subIdeaCurrentY0[leftOrRight], subIdeaDimensions, isLeftSubtree || leftOrRight === 0);
				subIdeaCurrentY0[leftOrRight] += subIdeaDimensions.Height;
			}
		}
		return result;
	};
	MAPJS.defaultStyles = {
		root: {background: '#22AAE0'},
		nonRoot: {background: '#E0E0E0'}
	};

	MAPJS.calculateLayout = function (idea, dimensionProvider, margin) {
		margin = margin || 10;
		var result = {
			nodes: {},
			connectors: {},
			links: {}
		},
			root = MAPJS.calculatePositions(idea, dimensionProvider, margin, 0, 0),
			calculateLayoutInner = function (positions, level) {
				var subIdeaRank, from, to, isRoot = level === 1,
					defaultStyle = MAPJS.defaultStyles[isRoot ? 'root' : 'nonRoot'],
					node = _.extend(_.pick(positions, ['id', 'width', 'height', 'title', 'attr']), {
						x: positions.x - root.x - 0.5 * root.width + margin,
						y: positions.y - root.y - 0.5 * root.height + margin,
						level: level
					});
				node.attr = node.attr || {};
				node.attr.style = _.extend({}, defaultStyle, node.attr.style);
				result.nodes[positions.id] = node;
				if (positions.ideas) {
					for (subIdeaRank in positions.ideas) {
						calculateLayoutInner(positions.ideas[subIdeaRank], level + 1);
						from = positions.id;
						to = positions.ideas[subIdeaRank].id;
						result.connectors[to] = {
							from: from,
							to: to
						};
					}
				}
			};
		MAPJS.LayoutCompressor.compress(root);
		calculateLayoutInner(root, 1);
		_.each(idea.links, function (link) {
			if (result.nodes[link.ideaIdFrom] && result.nodes[link.ideaIdTo]) {
				result.links[link.ideaIdFrom + '_' + link.ideaIdTo] = {
					ideaIdFrom: link.ideaIdFrom,
					ideaIdTo: link.ideaIdTo,
					attr: _.clone(link.attr)
				};
				//todo - clone
			}
		});
		return result;
	};
	MAPJS.calculateFrame = function (nodes, margin) {
		margin = margin || 0;
		var result = {
			top: _.min(nodes, function (node) {return node.y; }).y - margin,
			left: _.min(nodes, function (node) {return node.x; }).x - margin
		};
		result.width = margin + _.max(_.map(nodes, function (node) { return node.x + node.width; })) - result.left;
		result.height = margin + _.max(_.map(nodes, function (node) { return node.y + node.height; })) - result.top;
		return result;
	};
	MAPJS.contrastForeground = function (background) {
		/*jslint newcap:true*/
		var luminosity = Color(background).luminosity();
		if (luminosity < 0.5) {
			return '#EEEEEE';
		}
		if (luminosity < 0.9) {
			return '#4F4F4F';
		}
		return '#000000';
	};
}());
/*jslint forin: true, nomen: true*/
/*global MAPJS, _*/
MAPJS.LayoutCompressor = {};
MAPJS.LayoutCompressor.getVerticalDistanceBetweenNodes = function (firstNode, secondNode) {
	'use strict';
	var isFirstSecond, isSecondFirst, result = Infinity;
	isFirstSecond = firstNode.x + firstNode.width <= secondNode.x;
	isSecondFirst = secondNode.x + secondNode.width <= firstNode.x;
	if (!(isFirstSecond || isSecondFirst)) {
		result = firstNode.y < secondNode.y ? secondNode.y - (firstNode.y + firstNode.height) : firstNode.y - (secondNode.y + secondNode.height);
	}
	return result;
};
MAPJS.LayoutCompressor.getVerticalDistanceBetweenNodeLists = function (firstNodeList, secondNodeList) {
	'use strict';
	var result = Infinity, i, j;
	for (i = firstNodeList.length - 1; i >= 0; i -= 1) {
		for (j = secondNodeList.length - 1; j >= 0; j -= 1) {
			result = Math.min(result, MAPJS.LayoutCompressor.getVerticalDistanceBetweenNodes(firstNodeList[i], secondNodeList[j]));
		}
	}
	return result;
};
MAPJS.LayoutCompressor.nodeAndConnectorCollisionBox = function (node, parent) {
	'use strict';
	return {
		x: Math.min(node.x, parent.x + 0.5 * parent.width),
		y: node.y,
		width: node.width + 0.5 * parent.width,
		height: node.height
	};
};
MAPJS.LayoutCompressor.getSubTreeNodeList = function getSubTreeNodeList(positions, result, parent) {
	'use strict';
	var subIdeaRank;
	result = result || [];
	result.push(_.pick(positions, 'x', 'y', 'width', 'height'));
	if (parent) {
		result.push(MAPJS.LayoutCompressor.nodeAndConnectorCollisionBox(positions, parent));
	}
	for (subIdeaRank in positions.ideas) {
		getSubTreeNodeList(positions.ideas[subIdeaRank], result, positions);
	}
	return result;
};
MAPJS.LayoutCompressor.moveSubTreeVertically = function moveSubTreeVertically(positions, delta) {
	'use strict';
	var subIdeaRank;
	positions.y += delta;
	for (subIdeaRank in positions.ideas) {
		moveSubTreeVertically(positions.ideas[subIdeaRank], delta);
	}
};
MAPJS.LayoutCompressor.centerSubTrees = function (positions) {
	'use strict';
	var subIdeaRank, ranksInOrder = [], i, allLowerNodes = [], lowerSubtree, upperSubtree, verticalDistance;
	for (subIdeaRank in positions.ideas) {
		subIdeaRank = parseFloat(subIdeaRank);
		if (subIdeaRank > 0) {
			ranksInOrder.push(subIdeaRank);
		}
	}
	if (ranksInOrder.length > 2) {
		ranksInOrder.sort(function ascending(first, second) {
			return second - first;
		});
		for (i = 1; i < ranksInOrder.length - 1; i += 1) {
			lowerSubtree = positions.ideas[ranksInOrder[i - 1]];
			upperSubtree = positions.ideas[ranksInOrder[i]];
			allLowerNodes = allLowerNodes.concat(MAPJS.LayoutCompressor.getSubTreeNodeList(lowerSubtree));
			verticalDistance = MAPJS.LayoutCompressor.getVerticalDistanceBetweenNodeLists(
				allLowerNodes,
				MAPJS.LayoutCompressor.getSubTreeNodeList(upperSubtree)
			);
			if (verticalDistance > 0 && verticalDistance < Infinity) {
				MAPJS.LayoutCompressor.moveSubTreeVertically(upperSubtree, 0.5 * verticalDistance);
			}
		}
	}
};
MAPJS.LayoutCompressor.compress = function compress(positions) {
	'use strict';
	var subIdeaRank,
		ranksInOrder = [],
		negativeRanksInOrder = [],
		middle,
		delta,
		compressOneSide = function (ranks) {
			var i,
				upperSubtree,
				lowerSubtree,
				verticalDistance,
				allUpperNodes = [];
			for (i = 0; i < ranks.length - 1; i += 1) {
				upperSubtree = positions.ideas[ranks[i]];
				lowerSubtree = positions.ideas[ranks[i + 1]];
				allUpperNodes = allUpperNodes.concat(MAPJS.LayoutCompressor.getSubTreeNodeList(upperSubtree));
				verticalDistance = MAPJS.LayoutCompressor.getVerticalDistanceBetweenNodeLists(
					allUpperNodes,
					MAPJS.LayoutCompressor.getSubTreeNodeList(lowerSubtree)
				);
				if (verticalDistance < Infinity) {
					MAPJS.LayoutCompressor.moveSubTreeVertically(lowerSubtree, -verticalDistance);
				}
			}
		};
	for (subIdeaRank in positions.ideas) {
		subIdeaRank = parseFloat(subIdeaRank);
		compress(positions.ideas[subIdeaRank]);
		(subIdeaRank >= 0 ? ranksInOrder : negativeRanksInOrder).push(subIdeaRank);
	}
	ranksInOrder.sort(function ascending(first, second) {
		return first - second;
	});
	negativeRanksInOrder.sort(function descending(first, second) {
		return second - first;
	});
	compressOneSide(ranksInOrder);
	compressOneSide(negativeRanksInOrder);
	if (ranksInOrder.length) {
		middle = 0.5 * (positions.ideas[ranksInOrder[0]].y + positions.ideas[ranksInOrder[ranksInOrder.length - 1]].y + positions.ideas[ranksInOrder[ranksInOrder.length - 1]].height);
		positions.y = middle - 0.5 * positions.height;
	}
	if (negativeRanksInOrder.length) {
		middle = 0.5 * (positions.ideas[negativeRanksInOrder[0]].y + positions.ideas[negativeRanksInOrder[negativeRanksInOrder.length - 1]].y + positions.ideas[negativeRanksInOrder[negativeRanksInOrder.length - 1]].height);
		delta = positions.y - middle + 0.5 * positions.height;
		negativeRanksInOrder.forEach(function (rank) {
			MAPJS.LayoutCompressor.moveSubTreeVertically(positions.ideas[rank], delta);
		});
	}
	MAPJS.LayoutCompressor.centerSubTrees(positions);
	return positions;
};
/*jslint forin: true, nomen: true*/
/*global _, MAPJS, observable*/
MAPJS.MapModel = function (layoutCalculator, titlesToRandomlyChooseFrom, intermediaryTitlesToRandomlyChooseFrom) {
	'use strict';
	titlesToRandomlyChooseFrom = titlesToRandomlyChooseFrom || ['double click to edit'];
	intermediaryTitlesToRandomlyChooseFrom = intermediaryTitlesToRandomlyChooseFrom || titlesToRandomlyChooseFrom;
	var self = this,
		analytic,
		currentLayout = {
			nodes: {},
			connectors: {}
		},
		idea,
		isInputEnabled = true,
		isEditingEnabled = true,
		currentlySelectedIdeaId,
		getRandomTitle = function (titles) {
			return titles[Math.floor(titles.length * Math.random())];
		},
		horizontalSelectionThreshold = 300,
		moveNodes = function (nodes, deltaX, deltaY) {
			_.each(nodes, function (node) {
				node.x += deltaX;
				node.y += deltaY;
			});
		},
		isAddLinkMode,
		updateCurrentLayout = function (newLayout, contextNodeId) {
			var nodeId, newNode, oldNode, newConnector, oldConnector, linkId, newLink, oldLink;
			if (contextNodeId && currentLayout.nodes && currentLayout.nodes[contextNodeId] && newLayout.nodes[contextNodeId]) {
				moveNodes(newLayout.nodes,
					currentLayout.nodes[contextNodeId].x - newLayout.nodes[contextNodeId].x,
					currentLayout.nodes[contextNodeId].y - newLayout.nodes[contextNodeId].y
					);
			}
			for (nodeId in currentLayout.connectors) {
				newConnector = newLayout.connectors[nodeId];
				oldConnector = currentLayout.connectors[nodeId];
				if (!newConnector || newConnector.from !== oldConnector.from || newConnector.to !== oldConnector.to) {
					self.dispatchEvent('connectorRemoved', oldConnector);
				}
			}
			for (nodeId in currentLayout.nodes) {
				oldNode = currentLayout.nodes[nodeId];
				newNode = newLayout.nodes[nodeId];
				if (!newNode) {
					/*jslint eqeq: true*/
					if (nodeId == currentlySelectedIdeaId) {
						self.selectNode(idea.id);
					}
					self.dispatchEvent('nodeRemoved', oldNode, nodeId);
				}
			}
			for (nodeId in newLayout.nodes) {
				oldNode = currentLayout.nodes[nodeId];
				newNode = newLayout.nodes[nodeId];
				if (!oldNode) {
					self.dispatchEvent('nodeCreated', newNode);
				} else {
					if (newNode.x !== oldNode.x || newNode.y !== oldNode.y) {
						self.dispatchEvent('nodeMoved', newNode);
					}
					if (newNode.title !== oldNode.title) {
						self.dispatchEvent('nodeTitleChanged', newNode);
					}
					if (!_.isEqual(newNode.attr || {}, oldNode.attr || {})) {
						self.dispatchEvent('nodeAttrChanged', newNode);
					}
				}
			}
			for (nodeId in newLayout.connectors) {
				newConnector = newLayout.connectors[nodeId];
				oldConnector = currentLayout.connectors[nodeId];
				if (!oldConnector || newConnector.from !== oldConnector.from || newConnector.to !== oldConnector.to) {
					self.dispatchEvent('connectorCreated', newConnector);
				}
			}
			for (linkId in newLayout.links) {
				newLink = newLayout.links[linkId];
				oldLink = currentLayout.links && currentLayout.links[linkId];
				if (oldLink) {
					if (!_.isEqual(newLink.attr || {}, (oldLink && oldLink.attr) || {})) {
						self.dispatchEvent('linkAttrChanged', newLink);
					}
				} else {
					self.dispatchEvent('linkCreated', newLink);
				}
			}
			for (linkId in currentLayout.links) {
				oldLink = currentLayout.links[linkId];
				newLink = newLayout.links && newLayout.links[linkId];
				if (!newLink) {
					self.dispatchEvent('linkRemoved', oldLink);
				}
			}
			currentLayout = newLayout;
			self.dispatchEvent('layoutChangeComplete');
		},
		revertSelectionForUndo,
		checkDefaultUIActions = function (command, args) {
			var newIdeaId;
			if (command === 'addSubIdea' || command === 'insertIntermediate') {
				newIdeaId = args[2];
				revertSelectionForUndo = currentlySelectedIdeaId;
				self.selectNode(newIdeaId);
				self.editNode(false, true, true);
			}
			if (command === 'paste') {
				newIdeaId = args[2];
				self.selectNode(newIdeaId);
			}

		},
		getCurrentlySelectedIdeaId = function () {
			return currentlySelectedIdeaId || idea.id;
		},
		onIdeaChanged = function (command, args, originSession) {
			var localCommand = (!originSession) || originSession === idea.getSessionKey(),
				contextNodeId = ((command && command === 'updateAttr') || (!localCommand))  && getCurrentlySelectedIdeaId();
			revertSelectionForUndo = false;
			updateCurrentLayout(self.reactivate(layoutCalculator(idea)), contextNodeId);

			if (!localCommand) {
				return;
			}
			if (command === 'batch') {
				_.each(args, function (singleCmd) {
					checkDefaultUIActions(singleCmd[0], singleCmd.slice(1));
				});
			} else {
				checkDefaultUIActions(command, args);
			}
		},
		currentlySelectedIdea = function () {
			return (idea.findSubIdeaById(currentlySelectedIdeaId) || idea);
		},
		ensureNodeIsExpanded = function (source, nodeId) {
			var node = idea.findSubIdeaById(nodeId) || idea;
			if (node.getAttr('collapsed')) {
				idea.updateAttr(nodeId, 'collapsed', false);
			}
		};
	observable(this);
	analytic = self.dispatchEvent.bind(self, 'analytic', 'mapModel');
	self.getIdea = function () {
		return idea;
	};
	self.isEditingEnabled = function () {
		return isEditingEnabled;
	};
	self.getCurrentLayout = function () {
		return currentLayout;
	};
	self.analytic = analytic;
	this.setIdea = function (anIdea) {
		if (idea) {
			idea.removeEventListener('changed', onIdeaChanged);
			self.dispatchEvent('nodeSelectionChanged', currentlySelectedIdeaId, false);
			currentlySelectedIdeaId = undefined;
		}
		idea = anIdea;
		idea.addEventListener('changed', onIdeaChanged);
		onIdeaChanged();
		self.selectNode(idea.id, true);
		self.dispatchEvent('mapViewResetRequested');
	};
	this.setEditingEnabled = function (value) {
		isEditingEnabled = value;
	};
	this.getEditingEnabled = function () {
		return isEditingEnabled;
	};
	this.setInputEnabled = function (value) {
		if (isInputEnabled !== value) {
			isInputEnabled = value;
			self.dispatchEvent('inputEnabledChanged', value);
		}
	};
	this.getInputEnabled = function () {
		return isInputEnabled;
	};
	this.selectNode = function (id, force) {
		if (force || (isInputEnabled && (id !== currentlySelectedIdeaId || !self.isActivated(id)))) {
			if (currentlySelectedIdeaId) {
				self.dispatchEvent('nodeSelectionChanged', currentlySelectedIdeaId, false);
			}
			currentlySelectedIdeaId = id;
			self.dispatchEvent('nodeSelectionChanged', id, true);
		}
	};
	this.clickNode = function (id, event) {
		var button = event && event.button;
		if (event && (event.altKey || event.ctrlKey || event.metaKey)) {
			self.addLink('mouse', id);
		} else if (event && event.shiftKey) {
			/*don't stop propagation, this is needed for drop targets*/
			self.activateNode('mouse', id);
		} else if (isAddLinkMode && !button) {
			this.addLink('mouse', id);
			this.toggleAddLinkMode();
		} else {
			this.selectNode(id);
			if (button && isInputEnabled) {
				self.dispatchEvent('contextMenuRequested', id, event.layerX, event.layerY);
			}
		}
	};
	this.findIdeaById = function (id) {
		/*jslint eqeq:true */
		if (idea.id == id) {
			return idea;
		}
		return idea.findSubIdeaById(id);
	};
	this.getSelectedStyle = function (prop) {
		return this.getStyleForId(currentlySelectedIdeaId, prop);
	};
	this.getStyleForId = function (id, prop) {
		var node = currentLayout.nodes && currentLayout.nodes[id];
		return node && node.attr && node.attr.style && node.attr.style[prop];
	};
	this.toggleCollapse = function (source) {
		var selectedIdea = currentlySelectedIdea(),
			isCollapsed;
		if (self.isActivated(selectedIdea.id) && _.size(selectedIdea.ideas) > 0) {
			isCollapsed = selectedIdea.getAttr('collapsed');
		} else {
			isCollapsed = self.everyActivatedIs(function (id) {
				var node = self.findIdeaById(id);
				if (node && _.size(node.ideas) > 0) {
					return node.getAttr('collapsed');
				}
				return true;
			});
		}
		this.collapse(source, !isCollapsed);
	};
	this.collapse = function (source, doCollapse) {
		analytic('collapse:' + doCollapse, source);
		if (isInputEnabled) {
			self.applyToActivated(function (id) {
				var node = self.findIdeaById(id);
				if (node && (!doCollapse || (node.ideas && _.size(node.ideas) > 0))) {
					idea.updateAttr(id, 'collapsed', doCollapse);
				}
			});
		}
	};
	this.updateStyle = function (source, prop, value) {
		/*jslint eqeq:true */
		if (!isEditingEnabled) {
			return false;
		}
		if (isInputEnabled) {
			analytic('updateStyle:' + prop, source);
			self.applyToActivated(function (id) {
				if (self.getStyleForId(id, prop) != value) {
					var node = self.findIdeaById(id),
						merged;
					if (node) {
						merged = _.extend({}, node.getAttr('style'));
						merged[prop] = value;
						idea.updateAttr(id, 'style', merged);
					}
				}
			});
		}
	};
	this.updateLinkStyle = function (source, ideaIdFrom, ideaIdTo, prop, value) {
		if (!isEditingEnabled) {
			return false;
		}
		if (isInputEnabled) {
			analytic('updateLinkStyle:' + prop, source);
			var merged = _.extend({}, idea.getLinkAttr(ideaIdFrom, ideaIdTo, 'style'));
			merged[prop] = value;
			idea.updateLinkAttr(ideaIdFrom, ideaIdTo, 'style', merged);
		}
	};
	this.addSubIdea = function (source, parentId) {
		if (!isEditingEnabled) {
			return false;
		}
		var target = parentId || currentlySelectedIdeaId;
		analytic('addSubIdea', source);
		if (isInputEnabled) {
			idea.batch(function () {
				ensureNodeIsExpanded(source, target);
				idea.addSubIdea(target, getRandomTitle(titlesToRandomlyChooseFrom));
			});
		}
	};
	this.insertIntermediate = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		if (!isInputEnabled || currentlySelectedIdeaId === idea.id) {
			return false;
		}
		idea.insertIntermediate(currentlySelectedIdeaId, getRandomTitle(intermediaryTitlesToRandomlyChooseFrom));
		analytic('insertIntermediate', source);
	};
	this.addSiblingIdea = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('addSiblingIdea', source);
		if (isInputEnabled) {
			var parent = idea.findParent(currentlySelectedIdeaId) || idea;
			idea.batch(function () {
				ensureNodeIsExpanded(source, parent.id);
				idea.addSubIdea(parent.id, getRandomTitle(titlesToRandomlyChooseFrom));
			});
		}
	};
	this.removeSubIdea = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('removeSubIdea', source);
		if (isInputEnabled) {
			var shouldSelectParent,
				previousSelectionId = getCurrentlySelectedIdeaId(),
				parent = idea.findParent(previousSelectionId);
			self.applyToActivated(function (id) {
				var removed  = idea.removeSubIdea(id);
				/*jslint eqeq: true*/
				if (previousSelectionId == id) {
					shouldSelectParent = removed;
				}
			});
			if (shouldSelectParent) {
				self.selectNode(parent.id);
			}
		}
	};
	this.updateTitle = function (ideaId, title) {
		idea.updateTitle(ideaId, title);
	};
	this.editNode = function (source, shouldSelectAll, editingNew) {
		if (!isEditingEnabled) {
			return false;
		}
		if (source) {
			analytic('editNode', source);
		}
		if (!isInputEnabled) {
			return false;
		}
		var title = currentlySelectedIdea().title;
		if (title === 'Press Space or double-click to edit' || intermediaryTitlesToRandomlyChooseFrom.indexOf(title) !== -1 || titlesToRandomlyChooseFrom.indexOf(title) !== -1) {
			shouldSelectAll = true;
		}
		self.dispatchEvent('nodeEditRequested', currentlySelectedIdeaId, shouldSelectAll, !!editingNew);
	};
	this.scaleUp = function (source) {
		self.scale(source, 1.25);
	};
	this.scaleDown = function (source) {
		self.scale(source, 0.8);
	};
	this.scale = function (source, scaleMultiplier, zoomPoint) {
		if (isInputEnabled) {
			self.dispatchEvent('mapScaleChanged', scaleMultiplier, zoomPoint);
			analytic(scaleMultiplier < 1 ? 'scaleDown' : 'scaleUp', source);
		}
	};
	this.move = function (source, deltaX, deltaY) {
		if (isInputEnabled) {
			self.dispatchEvent('mapMoveRequested', deltaX, deltaY);
			analytic('move', source);
		}
	};
	this.resetView = function (source) {
		if (isInputEnabled) {
			self.selectNode(idea.id);
			self.dispatchEvent('mapViewResetRequested');
			analytic('resetView', source);
		}

	};
	this.openAttachment = function (source, nodeId) {
		analytic('openAttachment', source);
		nodeId = nodeId || currentlySelectedIdeaId;
		var node = currentLayout.nodes[nodeId],
			attachment = node && node.attr && node.attr.attachment;
		if (node) {
			self.dispatchEvent('attachmentOpened', nodeId, attachment);
		}
	};
	this.setAttachment = function (source, nodeId, attachment) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('setAttachment', source);
		var hasAttachment = !!(attachment && attachment.content);
		idea.updateAttr(nodeId, 'attachment', hasAttachment && attachment);
	};
	this.addLink = function (source, nodeIdTo) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('addLink', source);
		idea.addLink(currentlySelectedIdeaId, nodeIdTo);
	};
	this.selectLink = function (source, link, selectionPoint) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('selectLink', source);
		if (!link) {
			return false;
		}
		self.dispatchEvent('linkSelected', link, selectionPoint, idea.getLinkAttr(link.ideaIdFrom, link.ideaIdTo, 'style'));
	};
	this.removeLink = function (source, nodeIdFrom, nodeIdTo) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('removeLink', source);
		idea.removeLink(nodeIdFrom, nodeIdTo);
	};

	this.toggleAddLinkMode = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('toggleAddLinkMode', source);
		isAddLinkMode = !isAddLinkMode;
		self.dispatchEvent('addLinkModeToggled', isAddLinkMode);
	};
	self.undo = function (source) {
		if (!isEditingEnabled) {
			return false;
		}

		analytic('undo', source);
		var undoSelection = revertSelectionForUndo;
		if (isInputEnabled) {
			idea.undo();
			if (undoSelection) {
				self.selectNode(undoSelection);
			}
		}
	};
	self.redo = function (source) {
		if (!isEditingEnabled) {
			return false;
		}

		analytic('redo', source);
		if (isInputEnabled) {
			idea.redo();
		}
	};
	self.moveRelative = function (source, relativeMovement) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('moveRelative', source);
		if (isInputEnabled) {
			idea.moveRelative(currentlySelectedIdeaId, relativeMovement);
		}
	};
	self.cut = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('cut', source);
		if (isInputEnabled) {
			self.clipBoard = idea.clone(currentlySelectedIdeaId);
			var parent = idea.findParent(currentlySelectedIdeaId);
			if (idea.removeSubIdea(currentlySelectedIdeaId)) {
				self.selectNode(parent.id);
			}
		}
	};
	self.copy = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('copy', source);
		if (isInputEnabled) {
			self.clipBoard = idea.clone(currentlySelectedIdeaId);
		}
	};
	self.paste = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('paste', source);
		if (isInputEnabled) {
			idea.paste(currentlySelectedIdeaId, self.clipBoard);
		}
	};
	self.pasteStyle = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('pasteStyle', source);
		if (isInputEnabled && self.clipBoard) {

			var pastingStyle = self.clipBoard.attr && self.clipBoard.attr.style;
			self.applyToActivated(function (id) {
				idea.updateAttr(id, 'style', pastingStyle);
			});
		}
	};
	self.moveUp = function (source) { self.moveRelative(source, -1); };
	self.moveDown = function (source) { self.moveRelative(source, 1); };

	//node activation
	(function () {
		var activatedNodes = [],
			setActiveNodes = function (activated) {
				var wasActivated = _.clone(activatedNodes);
				activatedNodes = activated;
				self.dispatchEvent('activatedNodesChanged', _.difference(activatedNodes, wasActivated), _.difference(wasActivated, activatedNodes));
			};
		self.activateSiblingNodes = function (source) {
			var parent = idea.findParent(currentlySelectedIdeaId),
				siblingIds;
			analytic('activateSiblingNodes', source);
			if (!parent || !parent.ideas) {
				return;
			}
			siblingIds = _.map(parent.ideas, function (child) { return child.id; });
			setActiveNodes(siblingIds);
		};
		self.activateNodeAndChildren = function (source) {
			analytic('activateNodeAndChildren', source);
			var contextId = getCurrentlySelectedIdeaId(),
				subtree = idea.getSubTreeIds(contextId);
			subtree.push(contextId);
			setActiveNodes(subtree);
		};
		self.activateNode = function (source, nodeId) {
			analytic('activateNode', source);
			if (!self.isActivated(nodeId)) {
				setActiveNodes([nodeId].concat(activatedNodes));
			}
		};
		self.activateChildren = function (source) {
			analytic('activateChildren', source);
			var context = currentlySelectedIdea();
			if (!context || _.isEmpty(context.ideas) || context.getAttr('collapsed')) {
				return;
			}
			setActiveNodes(idea.getSubTreeIds(context.id));
		};
		self.activateSelectedNode = function (source) {
			analytic('activateSelectedNode', source);
			setActiveNodes([getCurrentlySelectedIdeaId()]);
		};
		self.isActivated = function (id) {
			/*jslint eqeq:true*/
			return _.find(activatedNodes, function (activeId) { return id == activeId; });
		};
		self.applyToActivated = function (toApply) {
			idea.batch(function () {_.each(activatedNodes, toApply); });
		};
		self.everyActivatedIs = function (predicate) {
			return _.every(activatedNodes, predicate);
		};
		self.activateLevel = function (source, level) {
			analytic('activateLevel', source);
			var toActivate = _.map(
				_.filter(
					currentLayout.nodes,
					function (node) {
						/*jslint eqeq:true*/
						return node.level == level;
					}
				),
				function (node) {return node.id; }
			);
			if (!_.isEmpty(toActivate)) {
				setActiveNodes(toActivate);
			}
		};
		self.reactivate = function (layout) {
			_.each(layout.nodes, function (node) {
				if (_.contains(activatedNodes, node.id)) {
					node.activated = true;
				}
			});
			return layout;
		};
		self.addEventListener('nodeSelectionChanged', function (id, isSelected) {
			if (!isSelected) {
				setActiveNodes([]);
				return;
			}
			setActiveNodes([id]);
		}, 1);
		self.addEventListener('nodeRemoved', function (node, id) {
			var selectedId = getCurrentlySelectedIdeaId();
			if (self.isActivated(id) && !self.isActivated(selectedId)) {
				setActiveNodes(activatedNodes.concat([selectedId]));
			}
		});
	}());


	(function () {
		var isRootOrRightHalf = function (id) {
				return currentLayout.nodes[id].x >= currentLayout.nodes[idea.id].x;
			},
			isRootOrLeftHalf = function (id) {
				return currentLayout.nodes[id].x <= currentLayout.nodes[idea.id].x;
			},
			nodesWithIDs = function () {
				return _.map(currentLayout.nodes,
					function (n, nodeId) {
						return _.extend({ id: parseInt(nodeId, 10)}, n);
					});
			};
		self.selectNodeLeft = function (source) {
			var node,
				rank,
				isRoot = currentlySelectedIdeaId === idea.id,
				targetRank = isRoot ? -Infinity : Infinity;
			if (!isInputEnabled) {
				return;
			}
			analytic('selectNodeLeft', source);
			if (isRootOrLeftHalf(currentlySelectedIdeaId)) {
				node = idea.id === currentlySelectedIdeaId ? idea : idea.findSubIdeaById(currentlySelectedIdeaId);
				ensureNodeIsExpanded(source, node.id);
				for (rank in node.ideas) {
					rank = parseFloat(rank);
					if ((isRoot && rank < 0 && rank > targetRank) || (!isRoot && rank > 0 && rank < targetRank)) {
						targetRank = rank;
					}
				}
				if (targetRank !== Infinity && targetRank !== -Infinity) {
					self.selectNode(node.ideas[targetRank].id);
				}
			} else {
				self.selectNode(idea.findParent(currentlySelectedIdeaId).id);
			}
		};
		self.selectNodeRight = function (source) {
			var node, rank, minimumPositiveRank = Infinity;
			if (!isInputEnabled) {
				return;
			}
			analytic('selectNodeRight', source);
			if (isRootOrRightHalf(currentlySelectedIdeaId)) {
				node = idea.id === currentlySelectedIdeaId ? idea : idea.findSubIdeaById(currentlySelectedIdeaId);
				ensureNodeIsExpanded(source, node.id);
				for (rank in node.ideas) {
					rank = parseFloat(rank);
					if (rank > 0 && rank < minimumPositiveRank) {
						minimumPositiveRank = rank;
					}
				}
				if (minimumPositiveRank !== Infinity) {
					self.selectNode(node.ideas[minimumPositiveRank].id);
				}
			} else {
				self.selectNode(idea.findParent(currentlySelectedIdeaId).id);
			}
		};
		self.selectNodeUp = function (source) {
			var previousSibling = idea.previousSiblingId(currentlySelectedIdeaId),
				nodesAbove,
				closestNode,
				currentNode = currentLayout.nodes[currentlySelectedIdeaId];
			if (!isInputEnabled) {
				return;
			}
			analytic('selectNodeUp', source);
			if (previousSibling) {
				self.selectNode(previousSibling);
			} else {
				if (!currentNode) { return; }
				nodesAbove = _.reject(nodesWithIDs(), function (node) {
					return node.y >= currentNode.y || Math.abs(node.x - currentNode.x) > horizontalSelectionThreshold;
				});
				if (_.size(nodesAbove) === 0) {
					return;
				}
				closestNode = _.min(nodesAbove, function (node) {
					return Math.pow(node.x - currentNode.x, 2) + Math.pow(node.y - currentNode.y, 2);
				});
				self.selectNode(closestNode.id);
			}
		};
		self.selectNodeDown = function (source) {
			var nextSibling = idea.nextSiblingId(currentlySelectedIdeaId),
				nodesBelow,
				closestNode,
				currentNode = currentLayout.nodes[currentlySelectedIdeaId];
			if (!isInputEnabled) {
				return;
			}
			analytic('selectNodeDown', source);
			if (nextSibling) {
				self.selectNode(nextSibling);
			} else {
				if (!currentNode) { return; }
				nodesBelow = _.reject(nodesWithIDs(), function (node) {
					return node.y <= currentNode.y || Math.abs(node.x - currentNode.x) > horizontalSelectionThreshold;
				});
				if (_.size(nodesBelow) === 0) {
					return;
				}
				closestNode = _.min(nodesBelow, function (node) {
					return Math.pow(node.x - currentNode.x, 2) + Math.pow(node.y - currentNode.y, 2);
				});
				self.selectNode(closestNode.id);
			}
		};
	}());
};
/*global MAPJS*/
MAPJS.dragdrop = function (mapModel, stage) {
	'use strict';
	var currentDroppable,
		findNodeOnStage = function (nodeId) {
			return stage.get('#node_' + nodeId)[0];
		},
		showAsDroppable = function (nodeId, isDroppable) {
			var node = findNodeOnStage(nodeId);
			node.setIsDroppable(isDroppable);
		},
		updateCurrentDroppable = function (nodeId) {
			if (currentDroppable !== nodeId) {
				if (currentDroppable) {
					showAsDroppable(currentDroppable, false);
				}
				currentDroppable = nodeId;
				if (currentDroppable) {
					showAsDroppable(currentDroppable, true);
				}
			}
		},
		isPointOverNode = function (x, y, node) { //move to mapModel candidate
			/*jslint eqeq: true*/
			return x >= node.x &&
				y >= node.y &&
				x <= node.x + node.width - 2 * 10 &&
				y <= node.y + node.height - 2 * 10;
		},
		canDropOnNode = function (id, x, y, node) {
			/*jslint eqeq: true*/
			return id != node.id && isPointOverNode(x, y, node);
		},
		tryFlip = function (rootNode, nodeBeingDragged, nodeDragEndX) {
			var flipRightToLeft = rootNode.x < nodeBeingDragged.x && nodeDragEndX < rootNode.x,
				flipLeftToRight = rootNode.x > nodeBeingDragged.x && rootNode.x < nodeDragEndX;
			if (flipRightToLeft || flipLeftToRight) {
				return mapModel.getIdea().flip(nodeBeingDragged.id);
			}
			return false;
		},
		nodeDragMove = function (id, x, y) {
			var nodeId, node;

			if (!mapModel.isEditingEnabled()) {
				return;
			}

			for (nodeId in mapModel.getCurrentLayout().nodes) {
				node = mapModel.getCurrentLayout().nodes[nodeId];
				if (canDropOnNode(id, x, y, node)) {
					updateCurrentDroppable(nodeId);
					return;
				}
			}
			updateCurrentDroppable(undefined);
		},
		nodeDragEnd = function (id, x, y, shouldCopy) {
			var nodeBeingDragged = mapModel.getCurrentLayout().nodes[id],
				nodeId,
				node,
				rootNode = mapModel.getCurrentLayout().nodes[mapModel.getIdea().id],
				verticallyClosestNode = { id: null, y: Infinity },
				clone;
			if (!mapModel.isEditingEnabled()) {
				mapModel.dispatchEvent('nodeMoved', nodeBeingDragged, 'failed');
				return;
			}
			updateCurrentDroppable(undefined);
			mapModel.dispatchEvent('nodeMoved', nodeBeingDragged);
			for (nodeId in mapModel.getCurrentLayout().nodes) {
				node = mapModel.getCurrentLayout().nodes[nodeId];
				if (canDropOnNode(id, x, y, node)) {
					if (shouldCopy) {
						clone = mapModel.getIdea().clone(id);
						if (!clone || !mapModel.getIdea().paste(nodeId, clone)) {
							mapModel.dispatchEvent('nodeMoved', nodeBeingDragged, 'failed');
							mapModel.analytic('nodeDragCloneFailed');
						}
					} else if (!mapModel.getIdea().changeParent(id, nodeId)) {
						mapModel.dispatchEvent('nodeMoved', nodeBeingDragged, 'failed');
						mapModel.analytic('nodeDragParentFailed');
					}
					return;
				}
				if ((nodeBeingDragged.x === node.x || nodeBeingDragged.x + nodeBeingDragged.width === node.x + node.width) && y < node.y) {
					if (!verticallyClosestNode || node.y < verticallyClosestNode.y) {
						verticallyClosestNode = node;
					}
				}
			}
			if (tryFlip(rootNode, nodeBeingDragged, x)) {
				return;
			}
			if (mapModel.getIdea().positionBefore(id, verticallyClosestNode.id)) {
				return;
			}
			mapModel.dispatchEvent('nodeMoved', nodeBeingDragged, 'failed');
			mapModel.analytic('nodeDragFailed');
		},
		screenToStageCoordinates = function (x, y) {
			return {
				x: (x - stage.getX()) / (stage.getScale().x || 1),
				y: (y - stage.getY()) / (stage.getScale().y || 1)
			};
		},
		getInteractionPoint = function (evt) {
			if (evt.changedTouches && evt.changedTouches[0]) {
				return screenToStageCoordinates(evt.changedTouches[0].clientX, evt.changedTouches[0].clientY);
			}
			return screenToStageCoordinates(evt.layerX, evt.layerY);
		};

	mapModel.addEventListener('nodeCreated', function (n) {
		var node = findNodeOnStage(n.id);
		node.on('dragstart', function () {
			node.moveToTop();
			node.setShadowOffset(8);
			node.setOpacity(0.3);
		});
		node.on('dragmove', function (evt) {
			var stagePoint = getInteractionPoint(evt);
			nodeDragMove(
				n.id,
				stagePoint.x,
				stagePoint.y
			);
		});
		node.on('dragend', function (evt) {
			var stagePoint = getInteractionPoint(evt);
			node.setShadowOffset(4);
			node.setOpacity(1);
			nodeDragEnd(
				n.id,
				stagePoint.x,
				stagePoint.y,
				evt.shiftKey
			);
		});
	});
};/*global _, Kinetic, MAPJS*/
/*jslint nomen: true*/
(function () {
	'use strict';
	var horizontalConnector, calculateConnector, calculateConnectorInner;
	Kinetic.Connector = function (config) {
		this.shapeFrom = config.shapeFrom;
		this.shapeTo = config.shapeTo;
		this.shapeType = 'Connector';
		Kinetic.Shape.call(this, config);
		this._setDrawFuncs();
	};
	horizontalConnector = function (parentX, parentY, parentWidth, parentHeight,
			childX, childY, childWidth, childHeight) {
		var childHorizontalOffset = parentX < childX ? 0.1 : 0.9,
			parentHorizontalOffset = 1 - childHorizontalOffset;
		return {
			from: {
				x: parentX + parentHorizontalOffset * parentWidth,
				y: parentY + 0.5 * parentHeight
			},
			to: {
				x: childX + childHorizontalOffset * childWidth,
				y: childY + 0.5 * childHeight
			},
			controlPointOffset: 0
		};
	};
	calculateConnector = function (parent, child) {
		return calculateConnectorInner(parent.getX(), parent.getY(), parent.getWidth(), parent.getHeight(),
			child.getX(), child.getY(), child.getWidth(), child.getHeight());
	};
	calculateConnectorInner = _.memoize(function (parentX, parentY, parentWidth, parentHeight,
			childX, childY, childWidth, childHeight) {
		var tolerance = 10,
			childMid = childY + childHeight * 0.5,
			parentMid = parentY + parentHeight * 0.5,
			childHorizontalOffset;
		if (Math.abs(parentMid - childMid) + tolerance < Math.max(childHeight, parentHeight * 0.75)) {
			return horizontalConnector(parentX, parentY, parentWidth, parentHeight, childX, childY, childWidth, childHeight);
		}
		childHorizontalOffset = parentX < childX ? 0 : 1;
		return {
			from: {
				x: parentX + 0.5 * parentWidth,
				y: parentY + 0.5 * parentHeight
			},
			to: {
				x: childX + childHorizontalOffset * childWidth,
				y: childY + 0.5 * childHeight
			},
			controlPointOffset: 0.75
		};
	}, function () {
		return Array.prototype.join.call(arguments, ',');
	});
	Kinetic.Connector.prototype = {
		isVisible: function (offset) {
			var stage = this.getStage(),
				conn = calculateConnector(this.shapeFrom, this.shapeTo),
				x = Math.min(conn.from.x, conn.to.x),
				y = Math.min(conn.from.y, conn.to.y),
				rect = new MAPJS.Rectangle(x, y, Math.max(conn.from.x, conn.to.x) - x, Math.max(conn.from.y, conn.to.y) - y);
			return stage && stage.isRectVisible(rect, offset);
		},
		drawFunc: function (canvas) {
			var context = canvas.getContext(),
				shapeFrom = this.shapeFrom,
				shapeTo = this.shapeTo,
				conn,
				offset,
				maxOffset;
			if (!this.isVisible()) {
				return;
			}
			conn = calculateConnector(shapeFrom, shapeTo);
			if (!conn) {
				return;
			}
			context.beginPath();
			context.moveTo(conn.from.x, conn.from.y);
			offset = conn.controlPointOffset * (conn.from.y - conn.to.y);
			maxOffset = Math.min(shapeTo.getHeight(), shapeFrom.getHeight()) * 1.5;
			offset = Math.max(-maxOffset, Math.min(maxOffset, offset));
			context.quadraticCurveTo(conn.from.x, conn.to.y - offset, conn.to.x, conn.to.y);
			canvas.stroke(this);
		}
	};
	Kinetic.Util.extend(Kinetic.Connector, Kinetic.Shape);
}());
/*global _, Kinetic*/
/*jslint nomen: true*/
(function () {
	'use strict';
	Kinetic.Link = function (config) {
		this.shapeFrom = config.shapeFrom;
		this.shapeTo = config.shapeTo;
		this.shapeType = 'Link';
		Kinetic.Shape.call(this, config);
		this._setDrawFuncs();
	};
	var calculateConnectorInner = _.memoize(
		function (parentX, parentY, parentWidth, parentHeight, childX, childY, childWidth, childHeight) {
			var parent = [
				{
					x: parentX + 0.5 * parentWidth,
					y: parentY
				},
				{
					x: parentX + parentWidth,
					y: parentY + 0.5 * parentHeight
				},
				{
					x: parentX + 0.5 * parentWidth,
					y: parentY + parentHeight
				},
				{
					x: parentX,
					y: parentY + 0.5 * parentHeight
				}
			], child = [
				{
					x: childX + 0.5 * childWidth,
					y: childY
				},
				{
					x: childX + childWidth,
					y: childY + 0.5 * childHeight
				},
				{
					x: childX + 0.5 * childWidth,
					y: childY + childHeight
				},
				{
					x: childX,
					y: childY + 0.5 * childHeight
				}
			], i, j, min = Infinity, bestParent, bestChild, dx, dy, current;
			for (i = 0; i < parent.length; i += 1) {
				for (j = 0; j < child.length; j += 1) {
					dx = parent[i].x - child[j].x;
					dy = parent[i].y - child[j].y;
					current = dx * dx + dy * dy;
					if (current < min) {
						bestParent = i;
						bestChild = j;
						min = current;
					}
				}
			}
			return {
				from: parent[bestParent],
				to: child[bestChild]
			};
		},
		function () {
			return Array.prototype.join.call(arguments, ',');
		}
	),
		calculateConnector = function (parent, child) {
			return calculateConnectorInner(parent.getX(), parent.getY(), parent.getWidth(), parent.getHeight(),
				child.getX(), child.getY(), child.getWidth(), child.getHeight());
		};
	Kinetic.Link.prototype = {
		drawHitFunc: function (canvas) {
			var context = canvas.getContext(),
				shapeFrom = this.shapeFrom,
				shapeTo = this.shapeTo,
				conn,
				strokeWidth = this.getStrokeWidth();
			this.setStrokeWidth(strokeWidth * 9);
			conn = calculateConnector(shapeFrom, shapeTo);
			context.fillStyle = this.getStroke();
			context.beginPath();
			context.moveTo(conn.from.x, conn.from.y);
			context.lineTo(conn.to.x, conn.to.y);
			canvas.stroke(this);
			this.setStrokeWidth(strokeWidth);
		},
		drawFunc: function (canvas) {
			var context = canvas.getContext(),
				shapeFrom = this.shapeFrom,
				shapeTo = this.shapeTo,
				conn,
				n = Math.tan(Math.PI / 9);
			conn = calculateConnector(shapeFrom, shapeTo);
			context.fillStyle = this.getStroke();
			context.beginPath();
			context.moveTo(conn.from.x, conn.from.y);
			context.lineTo(conn.to.x, conn.to.y);
			canvas.stroke(this);
			if (this.attrs.arrow) {
				var a1x, a1y, a2x, a2y, len = 14, iy, m,
					dx = conn.to.x - conn.from.x,
					dy = conn.to.y - conn.from.y;
				if (dx === 0) {
					iy = dy < 0 ? -1 : 1;
					a1x = conn.to.x + len * Math.sin(n) * iy;
					a2x = conn.to.x - len * Math.sin(n) * iy;
					a1y = conn.to.y - len * Math.cos(n) * iy;
					a2y = conn.to.y - len * Math.cos(n) * iy;
				} else {
					m = dy / dx;
					if (conn.from.x < conn.to.x) {
						len = -len;
					}
					a1x = conn.to.x + (1 - m * n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
					a1y = conn.to.y + (m + n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
					a2x = conn.to.x + (1 + m * n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
					a2y = conn.to.y + (m - n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
				}
				context.moveTo(a1x, a1y);
				context.lineTo(conn.to.x, conn.to.y);
				context.lineTo(a2x, a2y);
				context.lineTo(a1x, a1y);
				context.fill();
			}
		}
	};
	Kinetic.Util.extend(Kinetic.Link, Kinetic.Shape);
}());
Kinetic.Link.prototype.setMMAttr = function (newMMAttr) {
	'use strict';
	var style = newMMAttr && newMMAttr.style,
		dashTypes = {
			solid: [],
			dashed: [8, 8]
		};
	this.setStroke(style && style.color || 'red');
	this.setDashArray(dashTypes[style && style.lineStyle || 'dashed']);
	this.attrs.arrow = style && style.arrow || false;
};
/*global Kinetic*/
Kinetic.Clip = function (config) {
	'use strict';
	this.createAttrs();
	Kinetic.Shape.call(this, config);
	this.shapeType = 'Clip';
	this._setDrawFuncs();
};
Kinetic.Clip.prototype.drawFunc = function (canvas) {
	'use strict';
	var context = canvas.getContext(),
		xClip = this.getWidth() * 2 - this.getRadius() * 2;
	context.beginPath();
	context.moveTo(0, this.getClipTo());
	context.arcTo(0, 0, this.getWidth() * 2, 0,  this.getWidth());
	context.arcTo(this.getWidth() * 2, 0, this.getWidth() * 2, this.getHeight(),  this.getWidth());
	context.arcTo(this.getWidth() * 2, this.getHeight(), 0, this.getHeight(), this.getRadius());
	context.arcTo(xClip, this.getHeight(), xClip, 0, this.getRadius());
	context.lineTo(xClip, this.getClipTo() * 0.5);
	canvas.fillStroke(this);
};
Kinetic.Node.addGetterSetter(Kinetic.Clip, 'clipTo', 0);
Kinetic.Node.addGetterSetter(Kinetic.Clip, 'radius', 0);
Kinetic.Util.extend(Kinetic.Clip, Kinetic.Shape);
/*global MAPJS, Color, _, jQuery, Kinetic*/
/*jslint nomen: true, newcap: true, browser: true*/
(function () {
	'use strict';
	/*shamelessly copied from http://james.padolsey.com/javascript/wordwrap-for-javascript */
	var COLUMN_WORD_WRAP_LIMIT = 25;
	function wordWrap(str, width, brk, cut) {
		brk = brk || '\n';
		width = width || 75;
		cut = cut || false;
		if (!str) {
			return str;
		}
		var regex = '.{1,' + width + '}(\\s|$)' + (cut ? '|.{' + width + '}|.+$' : '|\\S+?(\\s|$)');
		return str.match(new RegExp(regex, 'g')).join(brk);
	}
	function joinLines(string) {
		return string.replace(/\n/g, ' ');
	}
	function breakWords(string) {
		return wordWrap(joinLines(string), COLUMN_WORD_WRAP_LIMIT, '\n', false);
	}
	function createLink() {
		var link = new Kinetic.Group(),
			rectProps = {
				width: 10,
				height: 20,
				rotation: 0.6,
				stroke: '#555555',
				strokeWidth: 3,
				cornerRadius: 6,
				shadowOffset: [2, 2],
				shadow: '#CCCCCC',
				shadowBlur: 0.4,
				shadowOpacity: 0.4
			},
			rect = new Kinetic.Rect(rectProps),
			rect2 = new Kinetic.Rect(rectProps);
		rect2.setX(7);
		rect2.setY(-7);
		link.add(rect);
		link.add(rect2);
		link.setActive = function (isActive) {
			rect2.setStroke(isActive ? 'black' : '#555555');
			rect.setStroke(rect2.getStroke());
			link.getLayer().draw();
		};
		return link;
	}
	function createClip() {
		var group, clip, props = {width: 5, height: 25, radius: 3, rotation: 0.1, strokeWidth: 2, clipTo: 10};
		group = new Kinetic.Group();
		group.getClipMargin = function () {
			return props.clipTo;
		};
		group.add(new Kinetic.Clip(_.extend({stroke: 'darkslategrey', x: 1, y: 1}, props)));
		clip = new Kinetic.Clip(_.extend({stroke: 'skyblue', x: 0, y: 0}, props));
		group.add(clip);
		group.on('mouseover', function () {
			clip.setStroke('black');
			group.getLayer().draw();
		});
		group.on('mouseout', function () {
			clip.setStroke('skyblue');
			group.getLayer().draw();
		});
		return group;
	}
	Kinetic.Idea = function (config) {
		var ENTER_KEY_CODE = 13,
			ESC_KEY_CODE = 27,
			self = this,
			unformattedText = joinLines(config.text),
			bgRect = function (offset) {
				return new Kinetic.Rect({
					strokeWidth: 1,
					cornerRadius: 10,
					x: offset,
					y: offset,
					visible: false
				});
			};
		this.level = config.level;
		this.mmAttr = config.mmAttr;
		this.isSelected = false;
		this.isActivated = !!config.activated;
		config.draggable = config.level > 1;
		config.name = 'Idea';
		Kinetic.Group.call(this, config);
		this.rectAttrs = {stroke: '#888', strokeWidth: 1};
		this.rect = new Kinetic.Rect({
			strokeWidth: 1,
			cornerRadius: 10
		});
		this.rectbg1 = bgRect(8);
		this.rectbg2 = bgRect(4);
		this.link = createLink();
		this.link.on('click tap', function () {
			var url = MAPJS.URLHelper.getLink(unformattedText);
			if (url) {
				window.open(url, '_blank');
			}
		});
		this.link.on('mouseover', function () {
			self.link.setActive(true);
		});
		this.link.on('mouseout', function () {
			self.link.setActive(false);
		});
		this.text = new Kinetic.Text({
			fontSize: 12,
			fontFamily: 'Helvetica',
			lineHeight: 1.5,
			fontStyle: 'bold',
			align: 'center'
		});
		this.clip = createClip();
		this.clip.on('click tap', function () {
			self.fire(':request', {type: 'openAttachment', source: 'mouse'});
		});
		this.add(this.rectbg1);
		this.add(this.rectbg2);
		this.add(this.rect);
		this.add(this.text);
		this.add(this.link);
		this.add(this.clip);
		this.activeWidgets = [this.link, this.clip];
		this.setText = function (text) {
			var replacement = breakWords(MAPJS.URLHelper.stripLink(text)) ||
					(text.length < COLUMN_WORD_WRAP_LIMIT ? text : (text.substring(0, COLUMN_WORD_WRAP_LIMIT) + '...'));
			unformattedText = text;
			self.text.setText(replacement);
			self.link.setVisible(MAPJS.URLHelper.containsLink(text));
			self.setStyle();
		};
		this.setText(config.text);
		this.classType = 'Idea';
		this.getNodeAttrs = function () {
			return self.attrs;
		};
		this.isVisible = function (offset) {
			var stage = self.getStage();
			return stage && stage.isRectVisible(new MAPJS.Rectangle(self.getX(), self.getY(), self.getWidth(), self.getHeight()), offset);
		};
		this.editNode = function (shouldSelectAll, deleteOnCancel) {
			self.fire(':editing');
			var canvasPosition = jQuery(self.getLayer().getCanvas().getElement()).offset(),
				ideaInput,
				onStageMoved = _.throttle(function () {
					ideaInput.css({
						top: canvasPosition.top + self.getAbsolutePosition().y,
						left: canvasPosition.left + self.getAbsolutePosition().x
					});
				}, 10),
				updateText = function (newText) {
					self.setStyle();
					self.getStage().draw();
					self.fire(':textChanged', {
						text: newText || unformattedText
					});
					ideaInput.remove();
					self.stopEditing = undefined;
					self.getStage().off('xChange yChange', onStageMoved);
				},
				onCommit = function () {
					if (ideaInput.val() === '') {
						onCancelEdit();
					} else {
						updateText(ideaInput.val());
					}
				},
				onCancelEdit = function () {
					updateText(unformattedText);
					if (deleteOnCancel) {
						self.fire(':request', {type: 'undo', source: 'internal'});
					}
				},
				scale = self.getStage().getScale().x || 1;
			ideaInput = jQuery('<textarea type="text" wrap="soft" class="ideaInput"></textarea>')
				.css({
					top: canvasPosition.top + self.getAbsolutePosition().y,
					left: canvasPosition.left + self.getAbsolutePosition().x,
					width: (6 + self.getWidth()) * scale,
					height: (6 + self.getHeight()) * scale,
					'padding': 3 * scale + 'px',
					'font-size': self.text.getFontSize() * scale + 'px',
					'line-height': '150%',
					'background-color': self.getBackground(),
					'margin': -3 * scale,
					'border-radius': self.rect.getCornerRadius() * scale + 'px',
					'border': self.rectAttrs.strokeWidth * (2 * scale) + 'px dashed ' + self.rectAttrs.stroke,
					'color': self.text.getFill()
				})
				.val(unformattedText)
				.appendTo('body')
				.keydown(function (e) {
					if (e.which === ENTER_KEY_CODE) {
						onCommit();
					} else if (e.which === ESC_KEY_CODE) {
						onCancelEdit();
					} else if (e.which === 9) {
						onCommit();
						e.preventDefault();
						self.fire(':request', {type: 'addSubIdea', source: 'keyboard'});
						return;
					} else if (e.which === 83 && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						onCommit();
						return; /* propagate to let the environment handle ctrl+s */
					} else if (!e.shiftKey && e.which === 90 && (e.metaKey || e.ctrlKey)) {
						if (ideaInput.val() === unformattedText) {
							onCancelEdit();
						}
					}
					e.stopPropagation();
				})
				.blur(onCommit)
				.focus(function () {
					if (shouldSelectAll) {
						if (ideaInput[0].setSelectionRange) {
							ideaInput[0].setSelectionRange(0, unformattedText.length);
						} else {
							ideaInput.select();
						}
					} else if (ideaInput[0].setSelectionRange) {
						ideaInput[0].setSelectionRange(unformattedText.length, unformattedText.length);
					}
				})
				.on('input', function () {
					var text = new Kinetic.Idea({
						text: ideaInput.val()
					});
					ideaInput.width(Math.max(ideaInput.width(), text.getWidth() * scale));
					ideaInput.height(Math.max(ideaInput.height(), text.getHeight() * scale));
				});
			self.stopEditing = onCancelEdit;
			ideaInput.focus();
			self.getStage().on('xChange yChange', onStageMoved);
		};
	};
}());

Kinetic.Idea.prototype.setShadowOffset = function (offset) {
	'use strict';
	offset = this.getMMScale().x * offset;
	_.each([this.rect, this.rectbg1, this.rectbg2], function (r) {
		r.setShadowOffset([offset, offset]);
	});
};

Kinetic.Idea.prototype.getMMScale = function () {
	'use strict';
	var stage = this.getStage(),
		scale = (stage && stage.getScaleX()) || this.getScaleX() || 1;
	return {x: scale, y: scale};
};


Kinetic.Idea.prototype.setupShadows = function () {
	'use strict';
	var scale = this.getMMScale().x,
		isSelected = this.isSelected,
		offset = this.isCollapsed() ? 3 * scale : 4 * scale,
		normalShadow = {
			color: 'black',
			blur: 10 * scale,
			offset: [offset, offset],
			opacity: 0.4 * scale
		},
		selectedShadow = {
			color: 'black',
			blur: 0,
			offset: [offset, offset],
			opacity: 1
		},
		shadow = isSelected ? selectedShadow : normalShadow;

	if (this.oldShadow && this.oldShadow.selected === isSelected && this.oldShadow.scale === scale && this.oldShadow.offset === offset) {
		return;
	}
	this.oldShadow = {selected: isSelected, scale: scale, offset: offset};
	_.each([this.rect, this.rectbg1, this.rectbg2], function (r) {
		r.setShadowColor(shadow.color);
		r.setShadowBlur(shadow.blur);
		r.setShadowOpacity(shadow.opacity);
		r.setShadowOffset(shadow.offset);
	});
};

Kinetic.Idea.prototype.getBackground = function () {
	'use strict';
	/*jslint newcap: true*/
	var isRoot = this.level === 1,
		defaultBg = MAPJS.defaultStyles[isRoot ? 'root' : 'nonRoot'].background,
		validColor = function (color, defaultColor) {
			if (!color) {
				return defaultColor;
			}
			var parsed = Color(color).hexString();
			return color.toUpperCase() === parsed.toUpperCase() ? color : defaultColor;
		};
	return validColor(this.mmAttr && this.mmAttr.style && this.mmAttr.style.background, defaultBg);
};

Kinetic.Idea.prototype.setStyle = function () {
	'use strict';
	/*jslint newcap: true*/
	var self = this,
		isDroppable = this.isDroppable,
		isSelected = this.isSelected,
		isActivated = this.isActivated,
		background = this.getBackground(),
		tintedBackground = Color(background).mix(Color('#EEEEEE')).hexString(),
		isClipVisible = this.mmAttr && this.mmAttr.attachment || false,
		padding = 8,
		clipMargin = isClipVisible ? this.clip.getClipMargin() : 0,
		rectOffset = clipMargin,
		rectIncrement = 4;
	this.clip.setVisible(isClipVisible);
	this.setWidth(this.text.getWidth() + 2 * padding);
	this.setHeight(this.text.getHeight() + 2 * padding + clipMargin);
	this.text.setX(padding);
	this.text.setY(padding + clipMargin);
	this.link.setX(this.text.getWidth() + 10);
	this.link.setY(this.text.getHeight() + 5 + clipMargin);
	_.each([this.rect, this.rectbg2, this.rectbg1], function (r) {
		r.setWidth(self.text.getWidth() + 2 * padding);
		r.setHeight(self.text.getHeight() + 2 * padding);
		r.setY(rectOffset);
		rectOffset += rectIncrement;
		if (isDroppable) {
			r.setStroke('#9F4F4F');
			r.setFill('#EF6F6F');
		} else if (isSelected) {
			r.setFill(background);
		} else {
			r.setStroke(self.rectAttrs.stroke);
			r.setFill(background);
		}
	});
	if (isActivated) {
		this.rect.setStroke('#2E9AFE');
		var dashes = [[5, 3, 0, 0], [4, 3, 1, 0], [3, 3, 2, 0], [2, 3, 3, 0], [1, 3, 4, 0], [0, 3, 5, 0], [0, 2, 5, 1], [0, 1, 5, 2]];
		if (true || this.disableAnimations) {
			self.rect.setDashArray(dashes[0]);
		} else {
			if (!this.activeAnimation) {
				this.activeAnimation = new Kinetic.Animation(
			        function (frame) {
						var da = dashes[Math.floor(frame.time / 30) % 8];
						self.rect.setDashArray(da);
			        },
			        self.getLayer()
			    );
			}
			this.activeAnimation.start();
		}
	} else {
		if (this.activeAnimation) {
			this.activeAnimation.stop();
		}
		this.rect.setDashArray([]);
	}
	this.rect.setDashArray(this.isActivated ? [5, 3] : []);
	this.rect.setStrokeWidth(this.isActivated ? 3 : self.rectAttrs.strokeWidth);
	this.rectbg1.setVisible(this.isCollapsed());
	this.rectbg2.setVisible(this.isCollapsed());
	this.clip.setX(this.text.getWidth() + padding);
	this.setupShadows();
	this.text.setFill(MAPJS.contrastForeground(tintedBackground));
};

Kinetic.Idea.prototype.setMMAttr = function (newMMAttr) {
	'use strict';
	this.mmAttr = newMMAttr;
	this.setStyle();
//	this.getLayer().draw();
};

Kinetic.Idea.prototype.getIsSelected = function () {
	'use strict';
	return this.isSelected;
};

Kinetic.Idea.prototype.isCollapsed = function () {
	'use strict';
	return this.mmAttr && this.mmAttr.collapsed || false;
};

Kinetic.Idea.prototype.setIsSelected = function (isSelected) {
	'use strict';
	this.isSelected = isSelected;
	this.setStyle();
	this.getLayer().draw();
	if (!isSelected && this.stopEditing) {
		this.stopEditing();
	}
};

Kinetic.Idea.prototype.setIsActivated = function (isActivated) {
	'use strict';
	this.isActivated = isActivated;
	this.setStyle();
//	this.getLayer().draw();
};

Kinetic.Idea.prototype.setIsDroppable = function (isDroppable) {
	'use strict';
	this.isDroppable = isDroppable;
	this.setStyle(this.attrs);
};

Kinetic.Util.extend(Kinetic.Idea, Kinetic.Group);
/*global _, Kinetic, MAPJS */
Kinetic.IdeaProxy = function (idea, stage, layer) {
	'use strict';
	var nodeimage,
		emptyImage,
		imageRendered,
		container = new Kinetic.Group({opacity: 1, draggable: true, id: idea.getId()}),
		removeImage = function () {
			nodeimage.setImage(emptyImage);
			imageRendered = false;
		},
		cacheImage = function () {
			if (!idea.isVisible()) {
				removeImage();
				return;
			}
			if (imageRendered) {
				return;
			}
			imageRendered = true;
			var imageScale = 1,
				scale = stage.getScale().x, x = -(scale * imageScale), y = -(scale * imageScale),
				unscaledWidth = idea.getWidth() + 20,
				unscaledHeight = idea.getHeight() + 20,
				width = (unscaledWidth * scale * imageScale),
				height = (unscaledHeight * scale * imageScale);

			idea.setScale({x: scale * imageScale, y: scale * imageScale});
			idea.toImage({
				x: x,
				y: y,
				width: width,
				height: height,
				callback: function (img) {
					nodeimage.setImage(img);
					nodeimage.setWidth(unscaledWidth);
					nodeimage.setHeight(unscaledHeight);
					layer.draw();
				}
			});
		},
		reRender = function () {
			imageRendered = false;
			cacheImage();
		},
		nodeImageDrawFunc;
	idea.disableAnimations = true;
	container.setX(idea.getX());
	container.setY(idea.getY());
	idea.setX(0);
	idea.setY(0);
	_.each(idea.activeWidgets, function (widget) { widget.remove(); });
	nodeimage = new Kinetic.Image({
		x: -1,
		y: -1,
		width: idea.getWidth() + 20,
		height: idea.getHeight() + 20
	});
	nodeImageDrawFunc = nodeimage.getDrawFunc().bind(nodeimage);
	nodeimage.setDrawFunc(function (canvas) {
		cacheImage();
		nodeImageDrawFunc(canvas);
	});
	container.add(nodeimage);
	_.each(idea.activeWidgets, function (widget) { container.add(widget); });
	container.getNodeAttrs = function () {
		return idea.attrs;
	};
	container.isVisible = function (offset) {
		return stage && stage.isRectVisible(new MAPJS.Rectangle(container.getX(), container.getY(), container.getWidth(), container.getHeight()), offset);
	};
	idea.isVisible = function (offset) {
		return stage && stage.isRectVisible(new MAPJS.Rectangle(container.getX(), container.getY(), container.getWidth(), container.getHeight()), offset);
	};
	idea.getLayer = function () {
		return layer;
	};
	idea.getStage = function () {
		return stage;
	};
	idea.getAbsolutePosition =  function () {
		return container.getAbsolutePosition();
	};
	_.each(['getHeight', 'getWidth', 'getIsSelected', 'getLayer'], function (fname) {
		container[fname] = function () {
			return idea && idea[fname] && idea[fname].apply(idea, arguments);
		};
	});
	_.each([':textChanged', ':editing', ':request'], function (fname) {
		idea.on(fname, function (event) {
			container.fire(fname, event);
			reRender();
		});
	});
	_.each(['setMMAttr', 'setIsSelected', 'setText', 'setIsDroppable', 'editNode', 'setupShadows', 'setShadowOffset', 'setIsActivated'], function (fname) {
		container[fname] = function () {
			var result = idea && idea[fname] && idea[fname].apply(idea, arguments);
			reRender();
			return result;
		};
	});
	return container;
};

/*global _, Kinetic, MAPJS*/
if (Kinetic.Stage.prototype.isRectVisible) {
	throw ('isRectVisible already exists, should not mix in our methods');
}

Kinetic.Tween.prototype.reset = function () {
	'use strict';
	this.tween.reset();
	return this;
};

MAPJS.Rectangle = function (x, y, width, height) {
	'use strict';
	this.scale = function (scale) {
		return new MAPJS.Rectangle(x * scale, y * scale, width * scale, height * scale);
	};
	this.translate = function (dx, dy) {
		return new MAPJS.Rectangle(x + dx, y + dy, width, height);
	};
	this.inset = function (margin) {
		return new MAPJS.Rectangle(x + margin, y + margin, width - (margin * 2), height - (margin * 2));
	};
	this.xscale = function (scale) {
		this.x *= scale;
		this.y *= scale;
		this.width *= scale;
		this.height *= scale;
		return this;
	};
	this.xtranslate = function (dx, dy) {
		this.x += dx;
		this.y += dy;
		return this;
	};
	this.xinset = function (margin) {
		this.x += margin;
		this.y += margin;
		this.width -= margin * 2;
		this.height -= margin * 2;
		return this;
	};
	this.x = x;
	this.y = y;
	this.height = height;
	this.width = width;
};
Kinetic.Stage.prototype.isRectVisible = function (rect, offset) {
	'use strict';
	offset = offset || {x: 0, y: 0, margin: 0};
	var scale = this.getScale().x || 1;
	rect = rect.xscale(scale).xtranslate(offset.x, offset.y).xinset(offset.margin);
	return !(
		rect.x + this.getX() > this.getWidth() ||
		rect.x + rect.width + this.getX() < 0  ||
		rect.y + this.getY() > this.getHeight() ||
		rect.y + rect.height + this.getY() < 0
	);
};

MAPJS.KineticMediator = function (mapModel, stage, imageRendering) {
	'use strict';
	window.stage = stage;
	var layer = new Kinetic.Layer(),
		nodeByIdeaId = {},
		connectorByFromIdeaIdToIdeaId = {},
		connectorKey = function (fromIdeaId, toIdeaId) {
			return fromIdeaId + '_' + toIdeaId;
		},
		atLeastOneVisible = function (list, deltaX, deltaY) {
			var margin = Math.min(stage.getHeight(), stage.getWidth()) * 0.1;
			return _.find(list, function (node) {
				return node.isVisible({x: deltaX, y: deltaY, margin: margin});
			});
		},
		moveStage = function (deltaX, deltaY) {
			var visibleAfterMove, visibleBeforeMove;
			if (!stage) {
				return;
			}

			visibleBeforeMove = atLeastOneVisible(nodeByIdeaId, 0, 0) || atLeastOneVisible(connectorByFromIdeaIdToIdeaId, 0, 0);
			visibleAfterMove = atLeastOneVisible(nodeByIdeaId, deltaX, deltaY) || atLeastOneVisible(connectorByFromIdeaIdToIdeaId, deltaX, deltaY);
			if (visibleAfterMove || (!visibleBeforeMove)) {
				if (deltaY !== 0) { stage.setY(stage.getY() + deltaY); }
				if (deltaX !== 0) { stage.setX(stage.getX() + deltaX); }
				stage.draw();
			}
		},
		resetStage = function () {
			new Kinetic.Tween({
				node: stage,
				x: 0.5 * stage.getWidth(),
				y: 0.5 * stage.getHeight(),
				scaleX: 1,
				scaleY: 1,
				easing: Kinetic.Easings.EaseInOut,
				duration: 0.05,
				onFinish: function () {
					stage.fire(':scaleChangeComplete');
				}
			}).play();
		},
		ensureSelectedNodeVisible = function (node) {
			var scale = stage.getScale().x || 1,
				offset = 100,
				move = { x: 0, y: 0 };
			if (!node.getIsSelected()) {
				return;
			}
			if (node.getAbsolutePosition().x + node.getWidth() * scale + offset > stage.getWidth()) {
				move.x = stage.getWidth() - (node.getAbsolutePosition().x + node.getWidth() * scale + offset);
			} else if (node.getAbsolutePosition().x < offset) {
				move.x  = offset - node.getAbsolutePosition().x;
			}
			if (node.getAbsolutePosition().y + node.getHeight() * scale + offset > stage.getHeight()) {
				move.y = stage.getHeight() - (node.getAbsolutePosition().y + node.getHeight() * scale + offset);
			} else if (node.getAbsolutePosition().y < offset) {
				move.y = offset - node.getAbsolutePosition().y;
			}
			new Kinetic.Tween({
				node: stage,
				x: stage.getX() + move.x,
				y: stage.getY() + move.y,
				duration: 0.4,
				easing: Kinetic.Easings.EaseInOut
			}).play();
		};
	stage.add(layer);
	layer.on('mouseover', function () {
		stage.getContainer().style.cursor = 'pointer';
	});
	layer.on('mouseout', function () {
		stage.getContainer().style.cursor = 'auto';
	});
	mapModel.addEventListener('addLinkModeToggled', function (isOn) {
		stage.getContainer().style.cursor = isOn ? 'crosshair' : 'auto';
		layer.off('mouseover mouseout');
		layer.on('mouseover', function () {
			stage.getContainer().style.cursor = isOn ? 'alias' : 'pointer';
		});
		layer.on('mouseout', function () {
			stage.getContainer().style.cursor = isOn ? 'crosshair' : 'auto';
		});
	});
	mapModel.addEventListener('nodeEditRequested', function (nodeId, shouldSelectAll, editingNew) {
		var node = nodeByIdeaId[nodeId];
		if (node) {
			node.editNode(shouldSelectAll, editingNew);
		}
	});
	mapModel.addEventListener('nodeCreated', function (n) {
		var node = new Kinetic.Idea({
			level: n.level,
			x: n.x,
			y: n.y,
			text: n.title,
			mmAttr: n.attr,
			opacity: 1,
			id: 'node_' + n.id,
			activated: n.activated
		});
		if (imageRendering) {
			node = Kinetic.IdeaProxy(node, stage, layer);
		}
		node.on('click tap', function (evt) { mapModel.clickNode(n.id, evt); });
		node.on('dblclick dbltap', function () {
			if (!mapModel.getEditingEnabled()) {
				mapModel.toggleCollapse('mouse');
				return;
			}
			mapModel.editNode('mouse', false, false);
		});
		node.on(':textChanged', function (event) {
			mapModel.updateTitle(n.id, event.text);
			mapModel.setInputEnabled(true);
		});
		node.on(':editing', function () {
			mapModel.setInputEnabled(false);
		});
		node.on(':request', function (event) {
			mapModel[event.type](event.source, n.id);
		});
		if (n.level > 1) {
			node.on('mouseover touchstart', stage.setDraggable.bind(stage, false));
			node.on('mouseout touchend', stage.setDraggable.bind(stage, true));
		}
		layer.add(node);
		stage.on(':scaleChangeComplete', function () {
			node.setupShadows();
		});
		nodeByIdeaId[n.id] = node;
	}, 1);
	mapModel.addEventListener('nodeSelectionChanged', function (ideaId, isSelected) {
		var node = nodeByIdeaId[ideaId];
		if (!node) {
			return;
		}
		node.setIsSelected(isSelected);
		if (!isSelected) {
			return;
		}
		ensureSelectedNodeVisible(node);
	});
	mapModel.addEventListener('nodeAttrChanged', function (n) {
		var node = nodeByIdeaId[n.id];
		node.setMMAttr(n.attr);
	});
	mapModel.addEventListener('nodeDroppableChanged', function (ideaId, isDroppable) {
		var node = nodeByIdeaId[ideaId];
		node.setIsDroppable(isDroppable);
	});
	mapModel.addEventListener('nodeRemoved', function (n) {
		var node = nodeByIdeaId[n.id];
		delete nodeByIdeaId[n.id];
		node.off('click dblclick tap dbltap dragstart dragmove dragend mouseover mouseout touchstart touchend :openAttachmentRequested :editing :textChanged ');
	//	node.destroy();
		new Kinetic.Tween({
			node: node,
			opacity: 0.25,
			easing: Kinetic.Easings.EaseInOut,
			duration: 0.2,
			onFinish: node.destroy.bind(node)
		}).play();
	});
	mapModel.addEventListener('nodeMoved', function (n, reason) {
		var node = nodeByIdeaId[n.id];
		new Kinetic.Tween({
			node: node,
			x: n.x,
			y: n.y,
			easing: reason === 'failed' ? Kinetic.Easings.BounceEaseOut: Kinetic.Easings.EaseInOut,
			duration: 0.4,
			onFinish: ensureSelectedNodeVisible.bind(undefined, node)
		}).play();
	});
	mapModel.addEventListener('nodeTitleChanged', function (n) {
		var node = nodeByIdeaId[n.id];
		node.setText(n.title);
//		layer.draw();
	});
	mapModel.addEventListener('connectorCreated', function (n) {
		var connector = new Kinetic.Connector({
			shapeFrom: nodeByIdeaId[n.from],
			shapeTo: nodeByIdeaId[n.to],
			stroke: '#888',
			strokeWidth: 1,
			opacity: 0
		});
		connectorByFromIdeaIdToIdeaId[connectorKey(n.from, n.to)] = connector;
		layer.add(connector);
		connector.moveToBottom();
		new Kinetic.Tween({
			node: connector,
			opacity: 1,
			easing: Kinetic.Easings.EaseInOut,
			duration: 0.1
		}).play();
	});
	mapModel.addEventListener('layoutChangeComplete', function () {
		stage.draw();
	});
	mapModel.addEventListener('connectorRemoved', function (n) {
		var key = connectorKey(n.from, n.to),
			connector = connectorByFromIdeaIdToIdeaId[key];
		delete connectorByFromIdeaIdToIdeaId[key];
		new Kinetic.Tween({
			node: connector,
			opacity: 0,
			easing: Kinetic.Easings.EaseInOut,
			duration: 0.1,
			onFinish: connector.destroy.bind(connector)
		}).play();
	});
	mapModel.addEventListener('linkCreated', function (l) {
		var link = new Kinetic.Link({
			id: 'link_' + l.ideaIdFrom + '_' + l.ideaIdTo,
			shapeFrom: nodeByIdeaId[l.ideaIdFrom],
			shapeTo: nodeByIdeaId[l.ideaIdTo],
			dashArray: [8, 8],
			stroke: '#800',
			strokeWidth: 1.5
		});
		link.on('click tap', function (event) {
			mapModel.selectLink('mouse', l, { x: event.layerX, y: event.layerY });
		});
		layer.add(link);
		link.moveToBottom();
		link.setMMAttr(l.attr);
	});
	mapModel.addEventListener('linkRemoved', function (l) {
		var link = layer.get('#link_' + l.ideaIdFrom + '_' + l.ideaIdTo)[0];
		link.destroy();
//		layer.draw();
	});
	mapModel.addEventListener('linkAttrChanged', function (l) {
		var link = layer.get('#link_' + l.ideaIdFrom + '_' + l.ideaIdTo)[0];
		link.setMMAttr(l.attr);
	});
	mapModel.addEventListener('mapScaleChanged', function (scaleMultiplier, zoomPoint) {
		var currentScale = stage.getScale().x || 1,
			targetScale = Math.max(Math.min(currentScale * scaleMultiplier, 5), 0.2);
		if (currentScale === targetScale) {
			return;
		}
		zoomPoint = zoomPoint || {x:  0.5 * stage.getWidth(), y: 0.5 * stage.getHeight()};
		new Kinetic.Tween({
			node: stage,
			x: zoomPoint.x + (stage.getX() - zoomPoint.x) * targetScale / currentScale,
			y: zoomPoint.y + (stage.getY() - zoomPoint.y) * targetScale / currentScale,
			scaleX: targetScale,
			scaleY: targetScale,
			easing: Kinetic.Easings.EaseInOut,
			duration: 0.01,
			onFinish: function () {
				stage.fire(':scaleChangeComplete');
			}
		}).play();
	});
	mapModel.addEventListener('mapViewResetRequested', function () {
		resetStage();
	});
	mapModel.addEventListener('mapMoveRequested', function (deltaX, deltaY) {
		moveStage(deltaX, deltaY);
	});
	mapModel.addEventListener('activatedNodesChanged', function (activatedNodes, deactivatedNodes) {
		var setActivated = function (active, id) {
			var node = nodeByIdeaId[id];
			if (!node) {
				return;
			}
			node.setIsActivated(active);
		};
		_.each(activatedNodes, setActivated.bind(undefined, true));
		_.each(deactivatedNodes, setActivated.bind(undefined, false));
		stage.draw();
	});
	(function () {
		var x, y;
		stage.on('dragmove', function () {
			var deltaX = x - stage.getX(),
				deltaY = y - stage.getY(),
				visibleAfterMove = atLeastOneVisible(nodeByIdeaId, 0, 0) || atLeastOneVisible(connectorByFromIdeaIdToIdeaId, 0, 0),
				shouldMoveBack = !visibleAfterMove && !(atLeastOneVisible(nodeByIdeaId, deltaX, deltaY) || atLeastOneVisible(connectorByFromIdeaIdToIdeaId, deltaX, deltaY));
			if (shouldMoveBack) {
				moveStage(deltaX, deltaY);
			} else {
				x = stage.getX();
				y = stage.getY();
			}
		});
	}());
};
MAPJS.KineticMediator.dimensionProvider = _.memoize(function (title) {
	'use strict';
	var text = new Kinetic.Idea({
		text: title
	});
	return {
		width: text.getWidth(),
		height: text.getHeight()
	};
});
MAPJS.KineticMediator.layoutCalculator = function (idea) {
	'use strict';
	return MAPJS.calculateLayout(idea, MAPJS.KineticMediator.dimensionProvider);
};
/*global jQuery*/
jQuery.fn.mapToolbarWidget = function (mapModel) {
	'use strict';
	var clickMethodNames = ['insertIntermediate', 'scaleUp', 'scaleDown', 'addSubIdea', 'editNode', 'removeSubIdea', 'toggleCollapse', 'addSiblingIdea', 'undo', 'redo',
			'copy', 'cut', 'paste', 'resetView', 'openAttachment', 'toggleAddLinkMode', 'activateChildren', 'activateNodeAndChildren', 'activateSiblingNodes'],
		changeMethodNames = ['updateStyle'];
	return this.each(function () {
		var element = jQuery(this);
		mapModel.addEventListener('nodeSelectionChanged', function () {
			element.find('.updateStyle[data-mm-target-property]').val(function () {
				return mapModel.getSelectedStyle(jQuery(this).data('mm-target-property'));
			}).change();
		});
		mapModel.addEventListener('addLinkModeToggled', function () {
			element.find('.toggleAddLinkMode').toggleClass('active');
		});
		clickMethodNames.forEach(function (methodName) {
			element.find('.' + methodName).click(function () {
				if (mapModel[methodName]) {
					mapModel[methodName]('toolbar');
				}
			});
		});
		changeMethodNames.forEach(function (methodName) {
			element.find('.' + methodName).change(function () {
				var tool = jQuery(this);
				if (tool.data('mm-target-property')) {
					mapModel[methodName]('toolbar', tool.data('mm-target-property'), tool.val());
				}
			});
		});
	});
};
/*jslint nomen: true*/
/*global _, jQuery, MAPJS, Kinetic */
MAPJS.pngExport = function (idea) {
	'use strict';
	var deferred = jQuery.Deferred(),
		layout = MAPJS.calculateLayout(idea, MAPJS.KineticMediator.dimensionProvider),
		frame = MAPJS.calculateFrame(layout.nodes, 10),
		hiddencontainer = jQuery('<div></div>').css('visibility', 'hidden')
			.appendTo('body').width(frame.width).height(frame.height).attr('id', 'hiddencontainer'),
		hiddenstage = new Kinetic.Stage({ container: 'hiddencontainer' }),
		layer = new Kinetic.Layer(),
		backgroundLayer = new Kinetic.Layer(),
		nodeByIdeaId = {},
		bg = new Kinetic.Rect({
			fill: '#ffffff',
			x: frame.left,
			y: frame.top,
			width: frame.width,
			height: frame.height
		});
	hiddenstage.add(backgroundLayer);
	backgroundLayer.add(bg);
	hiddenstage.add(layer);
	hiddenstage.setWidth(frame.width);
	hiddenstage.setHeight(frame.height);
	hiddenstage.setX(-1 * frame.left);
	hiddenstage.setY(-1 * frame.top);
	_.each(layout.nodes, function (n) {
		var node = new Kinetic.Idea({
			level: n.level,
			x: n.x,
			y: n.y,
			text: n.title,
			mmAttr: n.attr
		});
		nodeByIdeaId[n.id] = node;
		layer.add(node);
	});
	_.each(layout.connectors, function (n) {
		var connector = new Kinetic.Connector({
			shapeFrom: nodeByIdeaId[n.from],
			shapeTo: nodeByIdeaId[n.to],
			stroke: '#888',
			strokeWidth: 1
		});
		layer.add(connector);
		connector.moveToBottom();
	});
	_.each(layout.links, function (l) {
		var link = new Kinetic.Link({
			shapeFrom: nodeByIdeaId[l.ideaIdFrom],
			shapeTo: nodeByIdeaId[l.ideaIdTo],
			dashArray: [8, 8],
			stroke: '#800',
			strokeWidth: 1.5
		});
		layer.add(link);
		link.moveToBottom();
		link.setMMAttr(l.attr);
	});
	hiddenstage.draw();
	hiddenstage.toDataURL({
		callback: function (url) {
			deferred.resolve(url);
			hiddencontainer.remove();
		}
	});
	return deferred.promise();
};
/*global _, jQuery, Kinetic, MAPJS, window, document, $*/
jQuery.fn.mapWidget = function (activityLog, mapModel, touchEnabled, imageRendering) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this),
			stage = new Kinetic.Stage({
				container: 'container',
				draggable: true
			}),
			mediator = new MAPJS.KineticMediator(mapModel, stage, imageRendering),
			setStageDimensions = function () {
				stage.setWidth(element.width());
				stage.setHeight(element.height());
				stage.draw();
			},
			lastGesture,
			actOnKeys = true,
			discrete = function (gesture) {
				var result = (lastGesture && lastGesture.type !== gesture.type && (gesture.timeStamp - lastGesture.timeStamp < 250));
				lastGesture = gesture;
				return !result;
			},
			hotkeyEventHandlers = {
				'return': 'addSiblingIdea',
				'del backspace': 'removeSubIdea',
				'tab': 'addSubIdea',
				'left': 'selectNodeLeft',
				'up': 'selectNodeUp',
				'right': 'selectNodeRight',
				'down': 'selectNodeDown',
				'space': 'editNode',
				'shift+up': 'toggleCollapse',
				'c meta+x ctrl+x': 'cut',
				'p meta+v ctrl+v': 'paste',
				'y meta+c ctrl+c': 'copy',
				'u meta+z ctrl+z': 'undo',
				'shift+tab': 'insertIntermediate',
				'Esc 0 meta+0 ctrl+0': 'resetView',
				'r meta+shift+z ctrl+shift+z meta+y ctrl+y': 'redo',
				'meta+plus ctrl+plus z': 'scaleUp',
				'meta+minus ctrl+minus shift+z': 'scaleDown',
				'meta+up ctrl+up': 'moveUp',
				'meta+down ctrl+down': 'moveDown',
				'ctrl+shift+v meta+shift+v': 'pasteStyle'
			},
			charEventHandlers = {
				'[' : 'activateChildren',
				'{'	: 'activateNodeAndChildren',
				'='	: 'activateSiblingNodes',
				'.'	: 'activateSelectedNode',
				'/' : 'toggleCollapse',
				'a': 'openAttachment'
			},
			onScroll = function (event, delta, deltaX, deltaY) {
				if (event.target === jQuery(stage.getContainer()).find('canvas')[0]) {
					if (Math.abs(deltaX) < 5) {
						deltaX = deltaX * 5;
					}
					if (Math.abs(deltaY) < 5) {
						deltaY = deltaY * 5;
					}
					mapModel.move('mousewheel', -1 * deltaX, deltaY);
					if (event.preventDefault) { // stop the back button
						event.preventDefault();
					}
				}
			};
		_.each(hotkeyEventHandlers, function (mappedFunction, keysPressed) {
			jQuery(document).keydown(keysPressed, function (event) {
				if (actOnKeys) {
					event.preventDefault();
					mapModel[mappedFunction]('keyboard');
				}
			});
		});
		MAPJS.dragdrop(mapModel, stage);
		$(document).on('keypress', function (evt) {
			if (!actOnKeys) {
				return;
			}
			if (/INPUT|TEXTAREA/.test(evt && evt.target && evt.target.tagName)) {
				return;
			}
			var unicode = evt.charCode || evt.keyCode,
				actualkey = String.fromCharCode(unicode),
				mappedFunction = charEventHandlers[actualkey];
			if (mappedFunction) {
				evt.preventDefault();
				mapModel[mappedFunction]('keyboard');
			} else if (Number(actualkey) <= 9 && Number(actualkey) >= 1) {
				evt.preventDefault();
				mapModel.activateLevel('keyboard', Number(actualkey) + 1);
			}
		});
		element.data('mm-stage', stage);
		mapModel.addEventListener('inputEnabledChanged', function (canInput) {
			actOnKeys = canInput;
		});
		setStageDimensions();
		stage.setX(0.5 * stage.getWidth());
		stage.setY(0.5 * stage.getHeight());
		jQuery(window).bind('orientationchange resize', setStageDimensions);
		$(document).on('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); return false; });
		element.on('mousedown touch', function (e) {
			window.focus();
			if (document.activeElement !== e.target) {
				document.activeElement.blur();
			}
		});
		if (!touchEnabled) {
			jQuery(window).mousewheel(onScroll);
		} else {
			element.find('canvas').hammer().on('pinch', function (event) {
				if (discrete(event)) {
					mapModel.scale('touch', event.gesture.scale, {
						x: event.gesture.center.pageX - element.offset().left,
						y: event.gesture.center.pageY - element.offset().top
					});
				}
			}).on('swipe', function (event) {
				if (discrete(event)) {
					mapModel.move('touch', event.gesture.deltaX, event.gesture.deltaY);
				}
			}).on('doubletap', function () {
				mapModel.resetView();
			}).on('touch', function () {
				jQuery('.topbar-color-picker:visible').hide();
				jQuery('.ideaInput:visible').blur();
			});
		}
	});
};
/*global jQuery*/
jQuery.fn.linkEditWidget = function (mapModel) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this), currentLink, width, height, colorElement, lineStyleElement, arrowElement;
		colorElement = element.find('.color');
		lineStyleElement = element.find('.lineStyle');
		arrowElement = element.find('.arrow');
		mapModel.addEventListener('linkSelected', function (link, selectionPoint, linkStyle) {
			currentLink = link;
			element.show();
			width = width || element.width();
			height = height || element.height();
			element.css({
				top: (selectionPoint.y - 0.5 * height - 15) + 'px',
				left: (selectionPoint.x - 0.5 * width - 15) + 'px'
			});
			colorElement.val(linkStyle.color).change();
			lineStyleElement.val(linkStyle.lineStyle);
			arrowElement[linkStyle.arrow ? 'addClass' : 'removeClass']('active');
		});
		mapModel.addEventListener('mapMoveRequested', function () {
			element.hide();
		});
		element.find('.delete').click(function () {
			mapModel.removeLink('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo);
			element.hide();
		});
		colorElement.change(function () {
			mapModel.updateLinkStyle('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo, 'color', jQuery(this).val());
		});
		lineStyleElement.find('a').click(function () {
			mapModel.updateLinkStyle('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo, 'lineStyle', jQuery(this).text());
		});
		arrowElement.click(function () {
			mapModel.updateLinkStyle('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo, 'arrow', !arrowElement.hasClass('active'));
		});
		element.mouseleave(element.hide.bind(element));
	});
};
/*global window, jQuery*/
jQuery.fn.classCachingWidget = function (keyPrefix, store) {
	'use strict';
	var element = jQuery(this),
		key = keyPrefix + '-' + element.selector;
	jQuery(window).unload(function () {
		store[key] = element.attr('class');
	});
	element.addClass(store[key]);
	return this;
};
/*global MM, window*/
MM.navigation = function (storage, mapController) {
	'use strict';
	var self = this,
		unknownMapId = 'nil',
		mapIdRegEx = /[Mm]:([^,;#]*)/,
		getMapIdFromHash = function () {
			var windowHash = window && window.location && window.location.hash,
				found = windowHash && mapIdRegEx.exec(windowHash);
			return found && found[1];
		},
		setMapIdInHash = function (mapId) {
			if (mapIdRegEx.test(window.location.hash)) {
				window.location.hash = window.location.hash.replace(mapIdRegEx, 'm:' + mapId);
			} else if (window.location.hash && window.location.hash !== '#') {
				window.location.hash = window.location.hash + ',m:' + mapId;
			} else {
				window.location.hash = 'm:' + mapId;
			}
		},
		changeMapId = function (newMapId) {
			if (newMapId) {
				storage.setItem('mostRecentMapLoaded', newMapId);
			}
			newMapId = newMapId || unknownMapId;
			setMapIdInHash(newMapId);
			return true;
		};
	self.initialMapId = function () {
		var initialMapId = getMapIdFromHash();
		if (!initialMapId || initialMapId === unknownMapId) {
			initialMapId = (storage && storage.getItem && storage.getItem('mostRecentMapLoaded'));
		}
		return initialMapId;
	};
	self.loadInitial = function () {
		var mapId = self.initialMapId();
		mapController.loadMap(mapId || 'new');
		return mapId;
	};
	mapController.addEventListener('mapSaved mapLoaded', function (newMapId) {
		changeMapId(newMapId);
	});
	self.hashChange = function () {
		var newMapId = getMapIdFromHash();
		if (newMapId === unknownMapId) {
			return;
		}
		if (!newMapId) {
			changeMapId(mapController.currentMapId());
			return false;
		}
		mapController.loadMap(newMapId);
		return true;
	};
	window.addEventListener('hashchange', self.hashChange);
	return self;
};
/*global MM, jQuery, MAPJS, _*/
MM.Maps = {};
MM.Maps['default'] = MM.Maps['new'] = {'title': 'Press Space or double-click to edit', 'id': 1};

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
/*global jQuery, MM, observable*/
MM.ActivityLog = function (maxNumberOfElements) {
	'use strict';
	var activityLog = [], nextId = 1, self = this;
	observable(this);
	this.log = function () {
		var analyticArgs = ['log'];
		if (activityLog.length === maxNumberOfElements) {
			activityLog.shift();
		}
		activityLog.push({
			id: nextId,
			ts: new Date(),
			event: Array.prototype.join.call(arguments, ',')
		});
		nextId += 1;
		Array.prototype.slice.call(arguments).forEach(function (element) {
			if (jQuery.isArray(element)) {
				analyticArgs = analyticArgs.concat(element);
			} else {
				analyticArgs.push(element);
			}
		});
		self.dispatchEvent.apply(self, analyticArgs);
	};
	this.error = function (message) {
		self.log('Error', message);
		self.dispatchEvent('error', message, activityLog);
	};
	this.getLog = activityLog.slice.bind(activityLog);
};
jQuery.fn.trackingWidget = function (activityLog) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this),
			category = element.data('category'),
			eventType = element.data('event-type') || '',
			label = element.data('label') || '';
		element.click(function () {
			activityLog.log(category, eventType, label);
		});
	});
};
/*global jQuery, MM, observable, window */
MM.Alert = function () {
	'use strict';
	var self = this, lastId = 1;
	observable(this);
	this.show = function (message, detail, type) {
		var currentId = lastId;
		lastId += 1;
		self.dispatchEvent('shown', currentId, message, detail, type === "flash" ? "info" : type);
		if (type === "flash") {
			window.setTimeout(function () { self.hide(currentId); }, 3000);
		}
		return currentId;
	};
	this.hide = this.dispatchEvent.bind(this, 'hidden');
};
jQuery.fn.alertWidget = function (alert) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this);
		alert.addEventListener('shown', function (id, message, detail, type) {
			type = type || 'info';
			detail = detail || '';
			element.append(
				'<div class="alert fade in alert-' + type + ' alert-no-' + id + '">' +
					'<button type="button" class="close" data-dismiss="alert">&#215;</button>' +
					'<strong>' + message + '</strong>' +
					'&nbsp;' + detail +
					'</div>'
			);
		});
		alert.addEventListener('hidden', function (id) {
			element.find('.alert-no-' + id).remove();
		});
	});
};
/*global jQuery, MM, observable, XMLHttpRequest*/
MM.MapController = function (initialMapSources) {
	// order of mapSources is important, the first mapSource is default
	'use strict';
	observable(this);
	var self = this,
		dispatchEvent = this.dispatchEvent,
		mapLoadingConfirmationRequired,
		mapInfo = {},
		activeMapSource,
		mapSources = [].concat(initialMapSources),
		lastProperties,
		chooseMapSource = function (identifier) {
			// order of identifiers is important, the first identifier takes precedence
			var mapSourceIndex;
			for (mapSourceIndex = 0; mapSourceIndex < mapSources.length; mapSourceIndex++) {
				if (mapSources[mapSourceIndex].recognises(identifier)) {
					return mapSources[mapSourceIndex];
				}
			}
		},
		mapLoaded = function (idea, mapId, properties) {
			lastProperties = properties;
			mapLoadingConfirmationRequired = false;
			properties = properties || {};
			if (!properties.autoSave) {
				idea.addEventListener('changed', function () {
					mapLoadingConfirmationRequired = true;
				});
			}
			mapInfo = {
				idea: idea,
				mapId: properties.editable && mapId
			};
			dispatchEvent('mapLoaded', mapId, idea, properties);
		};
	self.addMapSource = function (mapSource) {
		mapSources.push(mapSource);
	};
	self.validMapSourcePrefixesForSaving = 'aog';
	self.setMap = mapLoaded;
	self.isMapLoadingConfirmationRequired = function () {
		return mapLoadingConfirmationRequired;
	};

	self.currentMapId = function () {
		return mapInfo && mapInfo.mapId;
	};

	self.loadMap = function (mapId, force) {
		var progressEvent = function (evt) {
				var done = (evt && evt.loaded) || 0,
					total = (evt && evt.total) || 1,
					message = ((evt && evt.loaded) ? Math.round(100 * done / total) + '%' : evt);
				dispatchEvent('mapLoading', mapId, message);
			},
			mapLoadFailed = function (reason, label) {
				var retryWithDialog = function () {
					dispatchEvent('mapLoading', mapId);
					activeMapSource.loadMap(mapId, true).then(mapLoaded, mapLoadFailed, progressEvent);
				}, mapSourceName = activeMapSource.description ? ' [' + activeMapSource.description + ']' : '';
				if (reason === 'no-access-allowed') {
					dispatchEvent('mapLoadingUnAuthorized', mapId, reason);
				} else if (reason === 'failed-authentication') {
					dispatchEvent('authorisationFailed', activeMapSource.description, retryWithDialog);
				} else if (reason === 'not-authenticated') {
					dispatchEvent('authRequired', activeMapSource.description, retryWithDialog);
				} else if (reason === 'map-load-redirect') {
					self.loadMap(label, force);
				} else {
					label = label ? label + mapSourceName : mapSourceName;
					dispatchEvent('mapLoadingFailed', mapId, reason, label);
				}
			};

		if (mapId === this.currentMapId() && !force) {
			return;
		}
		if (!force && mapLoadingConfirmationRequired) {
			dispatchEvent('mapLoadingConfirmationRequired', mapId);
			return;
		}
		activeMapSource = chooseMapSource(mapId);
		if (!activeMapSource) {
			dispatchEvent('mapIdNotRecognised', mapId);
			return;
		}
		dispatchEvent('mapLoading', mapId);
		activeMapSource.loadMap(mapId).then(
			mapLoaded,
			mapLoadFailed,
			progressEvent
		);
	};
	this.publishMap = function (mapSourceType) {
		var mapSaved = function (savedMapId, properties) {
				var previousWasReloadOnSave = lastProperties && lastProperties.reloadOnSave;
				properties = properties || {};
				lastProperties = properties;
				mapLoadingConfirmationRequired = false;
				mapInfo.mapId = savedMapId;
				dispatchEvent('mapSaved', savedMapId, mapInfo.idea, properties);
				if (previousWasReloadOnSave || properties.reloadOnSave) {
					self.loadMap(savedMapId, true);
				}
			},
			progressEvent = function (evt) {
				var done = (evt && evt.loaded) || 0,
					total = (evt && evt.total) || 1,
					message = ((evt && evt.loaded) ? Math.round(100 * done / total) + '%' : evt);
				dispatchEvent('mapSaving', activeMapSource.description, message);
			},
			mapSaveFailed = function (reason, label) {
				var retryWithDialog = function () {
					dispatchEvent('mapSaving', activeMapSource.description);
					activeMapSource.saveMap(mapInfo.idea, mapInfo.mapId, true).then(mapSaved, mapSaveFailed, progressEvent);
				}, mapSourceName = activeMapSource.description || '';
				label = label ? label + mapSourceName : mapSourceName;
				if (reason === 'no-access-allowed') {
					dispatchEvent('mapSavingUnAuthorized', function () {
						dispatchEvent('mapSaving', activeMapSource.description, 'Creating a new file');
						activeMapSource.saveMap(mapInfo.idea, 'new', true).then(mapSaved, mapSaveFailed, progressEvent);
					});
				} else if (reason === 'failed-authentication') {
					dispatchEvent('authorisationFailed', label, retryWithDialog);
				} else if (reason === 'not-authenticated') {
					dispatchEvent('authRequired', label, retryWithDialog);
				} else if (reason === 'user-cancel') {
					dispatchEvent('mapSavingCancelled');
				} else {
					dispatchEvent('mapSavingFailed', reason, label);
				}
			};
		activeMapSource = chooseMapSource(mapSourceType || mapInfo.mapId);
		dispatchEvent('mapSaving', activeMapSource.description);
		activeMapSource.saveMap(mapInfo.idea, mapInfo.mapId).then(
			mapSaved,
			mapSaveFailed,
			progressEvent
		);
	};
};
MM.MapController.activityTracking = function (mapController, activityLog) {
	'use strict';
	var startedFromNew = function (idea) {
		return idea.id === 1;
	},
		isNodeRelevant = function (ideaNode) {
			return ideaNode.title && ideaNode.title.search(/MindMup|Lancelot|cunning|brilliant|Press Space|famous|Luke|daddy/) === -1;
		},
		isNodeIrrelevant = function (ideaNode) {
			return !isNodeRelevant(ideaNode);
		},
		isMapRelevant = function (idea) {
			return startedFromNew(idea) && idea.find(isNodeRelevant).length > 5 && idea.find(isNodeIrrelevant).length < 3;
		},
		wasRelevantOnLoad,
		changed = false,
		oldIdea;
	mapController.addEventListener('mapLoaded', function (mapId, idea) {
		activityLog.log('Map', 'View', mapId);
		wasRelevantOnLoad = isMapRelevant(idea);
		if (oldIdea !== idea) {
			oldIdea = idea;
			idea.addEventListener('changed', function (command, args) {
				if (!changed) {
					changed = true;
					activityLog.log('Map', 'Edit');
				}
				activityLog.log(['Map', command].concat(args));
			});
		}
	});
	mapController.addEventListener('mapLoadingFailed', function (mapUrl, reason, label) {
		var message = 'Error loading map document [' + mapUrl + '] ' + JSON.stringify(reason);
		if (label) {
			message = message + ' label [' + label + ']';
		}
		activityLog.error(message);
	});
	mapController.addEventListener('mapSaving', activityLog.log.bind(activityLog, 'Map', 'Save Attempted'));
	mapController.addEventListener('mapSaved', function (id, idea) {
		changed = false;
		if (isMapRelevant(idea) && !wasRelevantOnLoad) {
			activityLog.log('Map', 'Created Relevant', id);
		} else if (wasRelevantOnLoad) {
			activityLog.log('Map', 'Saved Relevant', id);
		} else {
			activityLog.log('Map', 'Saved Irrelevant', id);
		}
	});
	mapController.addEventListener('mapSavingFailed', function (reason, repositoryName) {
		activityLog.error('Map save failed (' + repositoryName + ')' + JSON.stringify(reason));
	});
	mapController.addEventListener('networkError', function (reason) {
		activityLog.log('Map', 'networkError', JSON.stringify(reason));
	});
};
MM.MapController.alerts = function (mapController, alert) {
	'use strict';
	var alertId,
		showAlertWithCallBack = function (message, prompt, type, callback) {
			alert.hide(alertId);
			alertId = alert.show(
				message,
				'<a href="#" data-mm-role="auth">' + prompt + '</a>',
				type
			);
			jQuery('[data-mm-role=auth]').click(function () {
				alert.hide(alertId);
				callback();
			});
		},
		showErrorAlert = function (title, message) {
			alert.hide(alertId);
			alertId = alert.show(title, message, 'error');
		};

	mapController.addEventListener('mapLoadingConfirmationRequired', function (newMapId) {
		showAlertWithCallBack(
			'There are unsaved changes in the loaded map.',
			'Click here to continue',
			'warning',
			function () {
				mapController.loadMap(newMapId, true);
			}
		);
	});
	mapController.addEventListener('mapLoading', function (mapUrl, progressMessage) {
		alert.hide(alertId);
		alertId = alert.show('<i class="icon-spinner icon-spin"></i>&nbsp;Please wait, loading the map...', (progressMessage || ''));
	});
	mapController.addEventListener('mapSaving', function (repositoryName, progressMessage) {
		alert.hide(alertId);
		alertId = alert.show('<i class="icon-spinner icon-spin"></i>&nbsp;Please wait, saving the map...', (progressMessage || ''));
	});
	mapController.addEventListener('authRequired', function (providerName, authCallback) {
		showAlertWithCallBack(
			'This operation requires authentication through ' + providerName + ' !',
			'Click here to authenticate',
			'warning',
			authCallback
		);
	});
	mapController.addEventListener('mapSaved mapLoaded', function () {
		alert.hide(alertId);
	});
	mapController.addEventListener('authorisationFailed', function (providerName, authCallback) {
		showAlertWithCallBack(
			'We were unable to authenticate with ' + providerName,
			'Click here to try again',
			'warning',
			authCallback
		);
	});
	mapController.addEventListener('mapLoadingUnAuthorized', function () {
		showErrorAlert('The map could not be loaded.', 'You do not have the right to view this map');
	});
	mapController.addEventListener('mapSavingUnAuthorized', function (callback) {
		showAlertWithCallBack(
			'You do not have the right to edit this map',
			'Click here to save a copy',
			'error',
			callback
		);
	});
	mapController.addEventListener('mapLoadingFailed', function (mapId, reason, label) {
		showErrorAlert('Unfortunately, there was a problem loading the map.', label || 'An automated error report was sent and we will look into this as soon as possible');
	});
	mapController.addEventListener('mapSavingCancelled', function () {
		alert.hide(alertId);
	});
	mapController.addEventListener('mapSavingFailed', function (reason, label, callback) {
		var messages = {
			'file-too-large': ['Unfortunately, the file is too large for the selected storage provider.', 'Please select a different storage provider from the save dropdown menu'],
			'network-error': ['There was a network problem communicating with the server.', 'Please try again later. Don\'t worry, you have an auto-saved version in this browser profile that will be loaded the next time you open the map']
		},
			message = messages[reason] || ['Unfortunately, there was a problem saving the map.', 'Please try again later. We have sent an error report and we will look into this as soon as possible'];
		if (callback) {
			showAlertWithCallBack(message[0], message[1], 'warning', callback);
		} else {
			showErrorAlert(message[0], message[1]);
		}
	});


};
(function () {
	'use strict';
	var oldXHR = jQuery.ajaxSettings.xhr.bind(jQuery.ajaxSettings);
	jQuery.ajaxSettings.xhr = function () {
		var xhr = oldXHR();
		if (xhr instanceof XMLHttpRequest) {
			xhr.addEventListener('progress', this.progress, false);
		}
		if (xhr.upload) {
			xhr.upload.addEventListener('progress', this.progress, false);
		}
		return xhr;
	};
}());
/*jslint forin: true*/
/*global FormData, jQuery, MM */
MM.S3Adapter = function (s3Url, folder, activityLog, publishingConfigUrl, proxyLoadUrl) {
	'use strict';
	var properties = {editable: true, sharable: true};
	this.description = 'S3_CORS';

	this.recognises = function (mapId) {
		return mapId && mapId[0] === 'a';
	};

	this.loadMap = function (mapId) {
		var deferred = jQuery.Deferred(),
			onMapLoaded = function (result) {
				deferred.resolve(result, mapId, 'application/json', properties);
			},
			mapUrl = s3Url + folder + mapId + '.json',
			loadMapUsingProxy = function () {
				activityLog.log('Map', 'ProxyLoad', mapId);
				jQuery.ajax(
					proxyLoadUrl + mapId,
					{ dataType: 'json', success: onMapLoaded, error: deferred.reject }
				);
			};
		jQuery.ajax(
			mapUrl,
			{ dataType: 'json', success: onMapLoaded, error: loadMapUsingProxy }
		);
		return deferred.promise();
	};

	this.saveMap = function (contentToSave) {
		var deferred = jQuery.Deferred(),
			submitS3Form = function (publishingConfig) {
				var formData = new FormData();
				['key', 'AWSAccessKeyId', 'policy', 'signature'].forEach(function (parameter) {
					formData.append(parameter, publishingConfig[parameter]);
				});
				formData.append('acl', 'public-read');
				formData.append('Content-Type', 'text/plain');
				formData.append('file', contentToSave);
				jQuery.ajax({
					url: s3Url,
					type: 'POST',
					processData: false,
					contentType: false,
					data: formData
				}).done(function () {
					deferred.resolve(publishingConfig.s3UploadIdentifier, properties);
				}).fail(function (evt) {
					var errorReason = 'network-error',
						errorLabel = (evt && evt.responseText) || 'network-error',
						errorReasonMap = { 'EntityTooLarge': 'file-too-large' },
						errorDoc;
					try {
						errorDoc = evt && (evt.responseXML || jQuery.parseXML(evt.responseText));
						if (errorDoc) {
							errorReason = jQuery(errorDoc).find('Error Code').text() || errorReason;
							errorLabel = jQuery(errorDoc).find('Error Message').text() || errorLabel;
						}
					} catch (e) {
						// just ignore, the network error is set by default
					}
					deferred.reject(errorReasonMap[errorReason] || errorReason, errorLabel);
				});
			};
		activityLog.log('Fetching publishing config');
		jQuery.ajax(
			publishingConfigUrl,
			{ dataType: 'json', cache: false }
		).then(
			submitS3Form,
			deferred.reject.bind(deferred, 'network-error')
		);
		return deferred.promise();
	};
};
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
/*global jQuery, navigator, window, MM*/
MM.JotForm = function (formElement, alert) {
	'use strict';
	var nameElement = formElement.find('[name=q1_name]'),
		textAreaElement = formElement.find('textarea'),
		browserInfoElement = jQuery('<input type="hidden" name="q8_browserInfo" />').appendTo(formElement),
		activityLogElement = jQuery('<input type="hidden" name="q9_activityLog" />').appendTo(formElement),
		screenInfoElement = jQuery('<input type="hidden" name="q10_screenInfo" />').appendTo(formElement),
		pageInfoElement = jQuery('<input type="hidden" name="q11_pageInfo" />').appendTo(formElement),
		submitForm = function (log) {
			browserInfoElement.val(navigator.userAgent);
			activityLogElement.val(JSON.stringify(log));
			screenInfoElement.val(JSON.stringify(window.screen) + ' resolution:' + jQuery(window).width() + 'x' + jQuery(window).height());
			pageInfoElement.val(window.location.href);
			formElement.submit();
			textAreaElement.val('');
		};
	this.sendError = function (message, log) {
		textAreaElement.val(message);
		nameElement.val('automated error report');
		submitForm(log);
		nameElement.val('');
	};
	this.sendFeedback = function (log) {
		alert.show('Thank you for your feedback!', 'We\'ll get back to you as soon as possible.');
		submitForm(log);
	};
};
jQuery.fn.feedbackWidget = function (jotForm, activityLog) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this);
		element.find('.sendFeedback').click(function () {
			jotForm.sendFeedback(activityLog.getLog());
			element.modal('hide');
		});
	});
};
/*global document, jQuery*/
jQuery.fn.voteWidget = function (activityLog, alert) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this);
		element.on('show', function () {
			element.find('input:checked').attr('checked', false);
			element.find('[name=other]').val('');
		});
		jQuery('#sendVote').click(function () {
			var val = element.find('input:checked').val() || element.find('[name=other]').val();
			if (val) {
				activityLog.log('Feature Vote', val);
				alert.show('Thanks for voting', 'We\'ll do our best to roll popular features out quickly', 'success');
			} else {
				return false;
			}
		});
		if (document.location.hash === '#vote') {
			element.modal('show');
		}
	});
};
/*global jQuery*/
jQuery.fn.welcomeMessageWidget = function (activityLog) {
	'use strict';
	return this.each(function () {
		activityLog.log('Welcome Message', 'show', jQuery(this).data('message'));
	});
};
/*global jQuery*/
jQuery.fn.floatingToolbarWidget = function () {
	'use strict';
	return this.each(function () {
		var element = jQuery(this);
		element.draggable({containment: 'window'});
	});
};
/*global _, observable, jQuery, MM*/
MM.jsonStorage = function (storage) {
	'use strict';
	var self = {};
	self.setItem = function (key, value) {
		return storage.setItem(key, JSON.stringify(value));
	};
	self.getItem = function (key) {
		var item = storage.getItem(key);
		try {
			return JSON.parse(item);
		} catch (e) {
		}
	};
	self.remove = function (key) {
		storage.removeItem(key);
	};
	return self;
};
MM.Bookmark = function (mapController, storage, storageKey) {
	'use strict';
	var self = observable(this),
		currentMap = false,
		list = [],
		pushToStorage = function () {
			if (storage && storageKey) {
				storage.setItem(storageKey, list);
			}
		};
	if (storage && storageKey) {
		list = storage.getItem(storageKey) || [];
	}
	mapController.addEventListener('mapSaved', function (key, idea) {
		var couldPin = self.canPin();
		currentMap = {
			mapId: key,
			title: idea.title
		};
		self.store({
			mapId: key,
			title: idea.title
		});
		if (couldPin !== self.canPin()) {
			self.dispatchEvent('pinChanged');
		}
	});
	mapController.addEventListener('mapLoaded', function (key, idea) {
		var couldPin = self.canPin();
		currentMap = {
			mapId: key,
			title: idea.title
		};
		if (couldPin !== self.canPin()) {
			self.dispatchEvent('pinChanged');
		}
	});
	self.store = function (bookmark) {
		if (!(bookmark.mapId && bookmark.title)) {
			throw new Error('Invalid bookmark');
		}
		var existing = _.find(list, function (b) {
			return (b.title === bookmark.title) || (b.mapId === bookmark.mapId);
		});
		if (existing) {
			existing.mapId = bookmark.mapId;
			existing.title = bookmark.title;
		} else {
			list.push(_.clone(bookmark));
		}
		pushToStorage();
		self.dispatchEvent('added', bookmark);
	};
	self.remove = function (mapId, suppressAlert) {
		var idx, removed;
		suppressAlert = suppressAlert || false;
		for (idx = 0; idx < list.length; idx++) {
			if (list[idx].mapId === mapId) {
				removed = list.splice(idx, 1)[0];
				pushToStorage();
				self.dispatchEvent('deleted', removed, suppressAlert);
				return;
			}
		}
	};
	self.list = function () {
		return _.clone(list).reverse();
	};
	self.links = function (titleLimit) {
		titleLimit = titleLimit || 30;
		return _.map(self.list(), function (element) {
			return {
				title: element.title,
				shortTitle: element.title.length > titleLimit ? element.title.substr(0, titleLimit) + '...' : element.title,
				mapId: element.mapId
			};
		});
	};
	self.pin = function () {
		if (currentMap) {
			self.store(currentMap);
		}
	};
	self.canPin = function () {
		return currentMap && (list.length === 0 || _.every(list, function (bookmark) {
			return bookmark.mapId !== currentMap.mapId;
		}));
	};
};
jQuery.fn.bookmarkWidget = function (bookmarks, alert, mapController) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this),
			alertId,
			template = element.find('.template').detach(),
			pin = element.find('[data-mm-role=bookmark-pin]'),
			originalContent = element.children().filter('[data-mm-role=bookmark]').clone(),
			updateLinks = function () {
				var list = bookmarks.links(),
					link,
					children,
					addition;
				element.children().filter('[data-mm-role=bookmark]').remove();
				pin.parent().hide();
				if (bookmarks.canPin()) {
					pin.parent().show();
				}
				if (list.length) {
					list.slice(0, 10).forEach(function (bookmark) {
						addition = template.clone().show().attr('data-mm-role', 'bookmark').appendTo(element);
						link = addition.find('a');
						children = link.children().detach();
						link.click(function () {
							mapController.loadMap(bookmark.mapId);
						});
						link.text(bookmark.shortTitle).addClass('repo-' + bookmark.mapId[0]);
						children.appendTo(link);
						addition.find('[data-mm-role=bookmark-delete]').click(function () {
							bookmarks.remove(bookmark.mapId);
							element.parents('.dropdown').find('.dropdown-toggle').dropdown('toggle');
							return false;
						});
					});
				} else {
					element.append(originalContent.clone());
				}
			};
		pin.click(function () {
			bookmarks.pin();
		});
		bookmarks.addEventListener('added', updateLinks);
		bookmarks.addEventListener('pinChanged', updateLinks);
		bookmarks.addEventListener('deleted', function (mark, suppressAlert) {
			updateLinks();
			if (alert && !suppressAlert) {
				if (alertId) {
					alert.hide(alertId);
				}
				alertId = alert.show('Bookmark Removed.', mark.title + ' was removed from the list of your maps. <a href="#"> Undo </a> ', 'success');
				jQuery('.alert-no-' + alertId).find('a').click(function () {
					bookmarks.store(mark);
					alert.hide(alertId);
				});
			}
		});
		updateLinks();
	});
};
/*global jQuery*/
jQuery.fn.titleUpdateWidget = function (mapController) {
	'use strict';
	var elements = this;
	mapController.addEventListener('mapLoaded mapSaved', function (id, contentAggregate) {
		if (elements.prop('title')) {
			elements.prop('title', contentAggregate.title);
		}
	});
};
/*global $,document*/
$.fn.shareWidget = function () {
	'use strict';
	return this.each(function () {
		var self = $(this),
			target = self.attr('data-mm-target');
		if (!target) {
			return;
		}
		self.click(function () {
			var title = encodeURIComponent(document.title),
				url = encodeURIComponent(self.data('mm-url'));
			if (target === 'twitter') {
				self.attr('target', '_blank');
				self.attr('href', 'https://twitter.com/intent/tweet?text=' + title +
					'&url=' + url +
					'&source=mindmup.com&related=mindmup&via=mindmup');
				return true;
			}
			if (target === 'facebook') {
				self.attr('target', '_blank');
				self.attr('href', 'https://www.facebook.com/dialog/feed?app_id=621299297886954&' +
					'link=' + url + '&' +
					'name=' + title + '&' +
					'caption=' + encodeURIComponent('Mind map from mindmup.com') + '&' +
					'picture=' + encodeURIComponent('http://mindmup.s3.amazonaws.com/lib/img/logo_256.png') + '&' +
					'description=' + title + '&' +
					'redirect_uri=' + encodeURIComponent('http://www.mindmup.com/fb'));
				return true;
			}
			return false;
		});
	});
};
$.fn.googleShareWidget = function (mapController, googleDriveAdapter) {
	'use strict';
	return this.click(function () {
		googleDriveAdapter.showSharingSettings(mapController.currentMapId());
	});
};
/*global jQuery,document*/
jQuery.fn.shareEmailWidget = function () {
	'use strict';
	var shareModal = this,
		formElement = shareModal.find('form'),
		validate = function (element) {
			var valid = element.val();
			if (!valid) {
				element.parents('.control-group').addClass('error');
			} else {
				element.parents('.control-group').removeClass('error');
			}
			return valid;
		},
		submitForm = function () {
			var nameElement = formElement.find('[name=q6_yourName]'),
				emailElement = formElement.find('[name=q3_recipientEmail]'),
				messageElement = formElement.find('[name=q5_message]'),
				pathElement = formElement.find('[name=q4_path]'),
				titleElement = formElement.find('[name=q7_title]');
			if (validate(emailElement) && validate(nameElement) && validate(messageElement)) {
				pathElement.val(shareModal.data('mm-url'));
				titleElement.val(document.title);
				formElement.submit();
				messageElement.val('');
				emailElement.val('');
				shareModal.modal('hide');
			}
		};
	formElement.find('input').blur(function () { validate(jQuery(this)); });
	shareModal.find('[data-mm-role=submit]').click(submitForm);
	return shareModal;
};
/*global $ */
$.fn.background_upload = function (action, start, complete, fail) {
	'use strict';
	var element = this,
		sequence = $('iframe').length,
		active = false;
	start = start || function (name) { console.log('Uploading', name); };
	complete = complete || function (content) { console.log('Uploaded', content); };
	fail = fail || function (error) { console.log('Upload error', error); };
	$('<iframe style="display:none" name="upload-' + sequence + '"></iframe>').appendTo('body').load(
		function () {
			var result, fileType = active;
			if (!active) {
				return;
			}
			active = false;
			try {
				result = $(this.contentWindow.document.body).text();
			} catch (err) {
				fail('problem uploading the file to server', result);
				return;
			}
			complete(result, fileType);
		}
	);
	element.wrap('<form enctype="multipart/form-data" method="post" action="' + action + '" target="upload-' + sequence + '">');
	element.parents('form').submit(
		function () {
			var name = (element.val() || '').replace(/.*[\\\/]/g, '');
			active = name.split('.').pop();
			if (active !== 'mm' && active !== 'mup') {
				fail('unsupported type ' + active);
				active = false;
				return false;
			}
			start(name);
		}
	);
	element.change(function () {
		element.parents('form').submit();
	});
	return element;
};
/*global $, FileReader */
$.fn.file_reader_upload = function (start, complete, fail) {
	'use strict';
	var element = this,
		oFReader = new FileReader(),
		fileName,
		fileType;
	start = start || function (name) { console.log('Reading', name); };
	complete = complete || function (content) { console.log('Read', content); };
	fail = fail || function (error) { console.log('Read error', error); };
	oFReader.onload = function (oFREvent) {
		complete(oFREvent.target.result, fileType);
	};
	oFReader.onerror = function (oFREvent) {
		fail('Error reading file', oFREvent);
	};
	oFReader.onloadstart = function () {
		start(fileName);
	};
	element.change(function () {
		var fileInfo = this.files[0];
		fileName = fileInfo.name;
		fileType = fileName.split('.').pop();
		if (fileType !== 'mm' && fileType !== 'mup') {
			fail('unsupported format ' + fileType);
			return;
		}
		oFReader.readAsText(fileInfo, 'UTF-8');
		element.val('');
	});
	return element;
};
/*global $, MAPJS, MM, window*/
$.fn.importWidget = function (activityLog, mapController) {
	'use strict';
	var element = this,
		uploadType,
		statusDiv = element.find('[data-mm-role=status]'),
		fileInput = element.find('input[type=file]'),
		selectButton = element.find('[data-mm-role=select-file]'),
		spinner = function (text) {
			statusDiv.html('<i class="icon-spinner icon-spin"/> ' + text);
		},
		start = function (filename) {
			activityLog.log('Map', 'import:start ' + uploadType, filename);
			spinner('Uploading ' + filename);
		},
		parseFile = function (fileContent, type) {
			var counter = 0,
				expected;
			if (type === 'mm') {
				return MM.freemindImport(fileContent,
					function (total) {  expected = total; },
					function () {
						var pct = (100 * counter / expected).toFixed(2) + '%';
						if (counter % 1000 === 0) {
							spinner('Converted ' + pct);
						}
						counter++;
					});
			}
			if (type === 'mup') {
				return JSON.parse(fileContent);
			}
		},
		fail = function (error) {
			activityLog.log('Map', 'import:fail', error);
			statusDiv.html(
				'<div class="alert fade in alert-error">' +
					'<button type="button" class="close" data-dismiss="alert">&#215;</button>' +
					'<strong>' + error + '</strong>' +
					'</div>'
			);
		},
		success = function (fileContent, type) {
			var idea, jsonContent;
			spinner('Processing file');
			if (type !== 'mup' && type !== 'mm') {
				fail('unsupported format ' + type);
			}
			try {
				jsonContent = parseFile(fileContent, type);
				spinner('Initialising map');
				idea = MAPJS.content(jsonContent);
			} catch (e) {
				fail('invalid file content', e);
				return;
			}
			spinner('Done');
			activityLog.log('Map', 'import:complete');
			statusDiv.empty();
			element.modal('hide');
			mapController.setMap(idea);
		},
		shouldUseFileReader = function () {
			return (window.File && window.FileReader && window.FileList && window.Blob && (!$('body').hasClass('disable-filereader')));
		};
	if (shouldUseFileReader()) {
		fileInput.file_reader_upload(start, success, fail);
		uploadType = 'FileReader';
	} else {
		fileInput.background_upload('/import', start, success, fail);
		uploadType = 'Remote Upload';
	}
	element.on('shown', function () {
		fileInput.css('opacity', 0).css('position', 'absolute').offset(selectButton.offset()).width(selectButton.outerWidth())
			.height(selectButton.outerHeight());
	});
	return element;
};
/*global $, window*/
$.fn.toggleClassWidget = function () {
	'use strict';
	var element = this;
	element.filter('[data-mm-key]').each(function () {
		var button = $(this);
		$(window).keydown(button.data('mm-key'), function (evt) {
			button.click();
			evt.preventDefault();
		});
	});
	element.click(function () {
		var target = $($(this).data('mm-target')),
			targetClass = $(this).data('mm-class');
		target.toggleClass(targetClass);
	});
	return element;
};
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
/*global $, jQuery, MM, document, MAPJS, window, atob, ArrayBuffer, Uint8Array*/
jQuery.fn.remoteExportWidget = function (mapController, alert) {
	'use strict';
	var self = this,
		loadedIdea,
		downloadLink = ("download" in document.createElement("a")) ? $('<a>').addClass('hide').appendTo('body') : undefined,
		joinLines = function (string) {
			return string.replace(/\n/g, ' ').replace(/\r/g, ' ');
		},
		dataUriToBlob = function (dataURI) {
			var byteString = atob(dataURI.split(',')[1]),
				mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0],
				ab = new ArrayBuffer(byteString.length),
				ia = new Uint8Array(ab),
				i;
			for (i = 0; i < byteString.length; i++) {
				ia[i] = byteString.charCodeAt(i);
			}
			return new window.Blob([ab], {type: mimeString});
		},
		toObjectURL = function (contents, mimeType) {
			var browserUrl = window.URL || window.webkitURL;
			if (/^data:[a-z]*\/[a-z]*/.test(contents)) {
				return browserUrl.createObjectURL(dataUriToBlob(contents));
			}
			return browserUrl.createObjectURL(new window.Blob([contents], {type: mimeType}));
		};
	mapController.addEventListener('mapLoaded', function (mapId, idea) {
		loadedIdea = idea;
	});
	return this.click(function () {
		var exportForm = $($(this).data('mm-target')),
			toPromise = function (fn, mimeType) {
				return function () {
					return jQuery.Deferred().resolve(fn.apply(undefined, arguments), mimeType).promise();
				};
			},
			exportFunctions = {
				'mup' : toPromise(function (contentObject) { return JSON.stringify(contentObject, null, 2); }, 'application/json'),
				'mm' : toPromise(MM.freemindExport, 'text/xml'),
				'html': MM.exportToHtmlDocument,
				'png': MAPJS.pngExport,
				'txt': toPromise(MM.exportIdeas.bind({}, loadedIdea, new MM.TabSeparatedTextExporter()), 'text/plain')
			},
			format = $(this).data('mm-format'),
			title,
			elem,
			alertId;
		title = loadedIdea.title + '.' + format;
		if (alert) {
			alertId = alert.show('<i class="icon-spinner icon-spin"></i>&nbsp;Exporting map to ' + title, 'This may take a few seconds for larger maps', 'info');
		}
		elem = $(this);
		if (exportFunctions[format]) {
			exportFunctions[format](loadedIdea).then(
				function (contents, mimeType) {
					if (!contents) {
						return false;
					}
					if (alert && alertId) {
						alert.hide(alertId);
						alertId = undefined;
					}
					if (downloadLink && (!$('body').hasClass('force-remote'))) {
						downloadLink.attr('download', title).attr('href', toObjectURL(contents, mimeType));
						downloadLink[0].click();
					} else {
						exportForm.find('[name=title]').val(joinLines(title));
						exportForm.find('[name=map]').val(contents);
						exportForm.submit();
					}
				}
			);
		}
	});
};
/*global $, _ */
$.fn.googleDriveOpenWidget = function (googleDriveRepository, mapController) {
	'use strict';
	var modal = this,
		template = this.find('[data-mm-role=template]'),
		query,
		parent = template.parent(),
		statusDiv = this.find('[data-mm-role=status]'),
		showAlert = function (message, type) {
			type = type || 'block';
			statusDiv.html('<div class="alert fade-in alert-' + type + '">' +
					'<button type="button" class="close" data-dismiss="alert">&#215;</button>' +
					'<strong>' + message + '</strong>' + '</div>');
		},
		error = function (errorStatus) {
			showAlert(errorStatus, 'error');
		},
		loaded = function (fileList) {
			statusDiv.empty();
			var sorted = _.sortBy(fileList, function (file) {
				return file && file.modifiedDate;
			}).reverse();
			_.each(sorted, function (file) {
				var added;
				if (file) {
					added = template.clone().appendTo(parent);
					added.find('a[data-mm-role=file-link]')
						.text(file.title.replace(/\.mup$/, ''))
						.click(function () {
							modal.modal('hide');
							mapController.loadMap('g1' + file.id);
						});
					added.find('[data-mm-role=modification-status]').text('By ' + file.lastModifyingUserName + ' on ' +
						new Date(file.modifiedDate).toLocaleString());
				}
			});
		},
		fileRetrieval = function (showPopup) {
			parent.empty();
			statusDiv.html('<i class="icon-spinner icon-spin"/> Retrieving files...');
			googleDriveRepository.ready(showPopup).then(function () {
				googleDriveRepository.retrieveAllFiles(query).then(loaded, function () { error('Problem loading files from Google'); });
			}, function (reason) {
				if (reason === 'failed-authentication') {
					error('Authentication failed, we were not able to access your Google Drive');
				} else if (reason === 'not-authenticated') {
					showAlert('<h4>Authorisation required</h4>' +
						'<p>This action requires authorisation to access your Google Drive. <br/><a href="#">Click here to authorise</a></p>');
					statusDiv.find('a').click(function () {
						fileRetrieval(true);
					});
				} else {
					error('There was a network error, please try again later');
				}
			});
		};
	template.detach();
	modal.find('[data-mm-mimetype]').click(function () {
		if ($(this).data('mm-mimetype')) {
			query = 'mimeType contains \'' + $(this).data('mm-mimetype') + '\' and not trashed';
		} else {
			query = undefined;
		}
	});
	modal.on('show', function () {
		fileRetrieval(false);
	});
	return modal;
};
/*global $, _ */
$.fn.localStorageOpenWidget = function (offlineMapStorage, mapController) {
	'use strict';
	var modal = this,
		template = this.find('[data-mm-role=template]'),
		parent = template.parent(),
		statusDiv = this.find('[data-mm-role=status]'),
		showAlert = function (message, type, prompt, callback) {
			type = type || 'block';
			var html = '<div class="alert fade-in alert-' + type + '">' +
					'<button type="button" class="close" data-dismiss="alert">&#215;</button>' +
					'<strong>' + message + '</strong>';
			if (callback && prompt) {
				html = html + '&nbsp;<a href="#" data-mm-role="auth">' + prompt + '</a>';
			}
			html = html + '</div>';
			statusDiv.html(html);
			$('[data-mm-role=auth]').click(function () {
				statusDiv.empty();
				callback();
			});
		},
		restoreMap = function (mapId, map, mapInfo) {
			offlineMapStorage.restore(mapId, map, mapInfo);
			fileRetrieval();
		},
		deleteMap = function (mapId, mapInfo, title) {
			var map = offlineMapStorage.load(mapId);
			offlineMapStorage.remove(mapId);
			fileRetrieval();
			showAlert('Map "' + title + '" removed.', 'info', 'Undo', restoreMap.bind(undefined, mapId, map, mapInfo));
		},
		loaded = function (fileMap) {
			statusDiv.empty();
			var sorted = [];
			_.each(fileMap, function (value, key) {
				sorted.push({id: key, title: value.d || 'map', modifiedDate: value.t * 1000, info: value});
			});
			sorted = _.sortBy(sorted, function (file) {
				return file && file.modifiedDate;
			}).reverse();
			if (sorted && sorted.length > 0) {
				_.each(sorted, function (file) {
					var added;
					if (file) {
						added = template.clone().appendTo(parent);
						added.find('a[data-mm-role=file-link]')
							.text(file.title)
							.click(function () {
								modal.modal('hide');
								mapController.loadMap(file.id);
							});
						added.find('[data-mm-role=modification-status]').text(new Date(file.modifiedDate).toLocaleString());
						added.find('[data-mm-role=map-delete]').click(deleteMap.bind(undefined, file.id, file.info, file.title));
					}
				});
			} else {
				$('<tr><td colspan="3">No maps found in Browser storage</td></tr>').appendTo(parent);
			}
		},
		fileRetrieval = function () {
			parent.empty();
			statusDiv.html('<i class="icon-spinner icon-spin"/> Retrieving files...');
			try {
				loaded(offlineMapStorage.list());
			} catch (e) {
				showAlert('Unable to retrieve files from browser storage', 'error');
			}
		};
	template.detach();
	modal.on('show', function () {
		fileRetrieval();
	});
	return modal;
};
/*global $, window, Color*/

$.fn.commandLineWidget = function (keyBinding, mapModel) {
	'use strict';
	var element = this;
	element.keyup(keyBinding, function () {
		if (!mapModel.getInputEnabled()) {
			return;
		}
		var input,
			validColor = function (value) {
				/*jslint newcap:true*/
				var color = value && Color(value.toLowerCase()),
					valid = color &&
						(color.hexString().toUpperCase() === value.toUpperCase() ||
						(color.keyword() && (color.keyword().toUpperCase() !== 'BLACK' || value.toUpperCase() === 'BLACK')));
				if (valid) {
					return color;
				}
				if (value && value[0] !== '#') {
					return validColor('#' + value);
				}
				return false;
			},
			hide = function () {
				if (input) {
					input.remove();
				}
				mapModel.setInputEnabled(true);
			},
			commit = function () {
				var value = input && input.val(),
					color = validColor(value.toLowerCase());
				hide();
				if (color) {
					mapModel.updateStyle('cmdline', 'background', color.hexString());
				}
			},
			colors = [
				"aliceblue",
				"antiquewhite",
				"aqua",
				"aquamarine",
				"azure",
				"beige",
				"bisque",
				"black",
				"blanchedalmond",
				"blue",
				"blueviolet",
				"brown",
				"burlywood",
				"cadetblue",
				"chartreuse",
				"chocolate",
				"coral",
				"cornflowerblue",
				"cornsilk",
				"crimson",
				"cyan",
				"darkblue",
				"darkcyan",
				"darkgoldenrod",
				"darkgrey",
				"darkgreen",
				"darkkhaki",
				"darkmagenta",
				"darkolivegreen",
				"darkorange",
				"darkorchid",
				"darkred",
				"darksalmon",
				"darkseagreen",
				"darkslateblue",
				"darkslategrey",
				"darkturquoise",
				"darkviolet",
				"deeppink",
				"deepskyblue",
				"dimgrey",
				"dodgerblue",
				"firebrick",
				"floralwhite",
				"forestgreen",
				"fuchsia",
				"gainsboro",
				"ghostwhite",
				"gold",
				"goldenrod",
				"grey",
				"green",
				"greenyellow",
				"honeydew",
				"hotpink",
				"indianred",
				"indigo",
				"ivory",
				"khaki",
				"lavender",
				"lavenderblush",
				"lawngreen",
				"lemonchiffon",
				"lightblue",
				"lightcoral",
				"lightcyan",
				"lightgoldenrodyellow",
				"lightgrey",            // IE6 breaks on this color
				"lightgreen",
				"lightpink",
				"lightsalmon",
				"lightseagreen",
				"lightskyblue",
				"lightslategrey",
				"lightsteelblue",
				"lightyellow",
				"lime",
				"limegreen",
				"linen",
				"magenta",
				"maroon",
				"mediumaquamarine",
				"mediumblue",
				"mediumorchid",
				"mediumpurple",
				"mediumseagreen",
				"mediumslateblue",
				"mediumspringgreen",
				"mediumturquoise",
				"mediumvioletred",
				"midnightblue",
				"mintcream",
				"mistyrose",
				"moccasin",
				"navajowhite",
				"navy",
				"oldlace",
				"olive",
				"olivedrab",
				"orange",
				"orangered",
				"orchid",
				"palegoldenrod",
				"palegreen",
				"paleturquoise",
				"palevioletred",
				"papayawhip",
				"peachpuff",
				"peru",
				"pink",
				"plum",
				"powderblue",
				"purple",
				"red",
				"rosybrown",
				"royalblue",
				"saddlebrown",
				"salmon",
				"sandybrown",
				"seagreen",
				"seashell",
				"sienna",
				"silver",
				"skyblue",
				"slateblue",
				"slategrey",
				"snow",
				"springgreen",
				"steelblue",
				"tan",
				"teal",
				"thistle",
				"tomato",
				"turquoise",
				"violet",
				"wheat",
				"white",
				"whitesmoke",
				"yellow",
				"yellowgreen"
			];
		mapModel.setInputEnabled(false);
		input  = $('<input type="text" placeholder="Type a color name or hex…">')
			.css('position', 'absolute')
			.css('z-index', '9999')
			.appendTo(element)
			.css('top', '30%')
			.css('left', '40%')
			.css('width', '20%')
			.css('border-width', '5px')
			.focus()
			.blur(hide)
			.keyup("Esc", hide)
			.change(commit)
			.typeahead({
				source: colors,
				highlighter: function (item) {
					return '<span style="background-color:' + item + ';" >&nbsp;</span>&nbsp;' + item;
				}
			});
	});
	return element;
};
/*global MM, $, _, escape*/
MM.freemindImport = function (xml, start, progress) {
	'use strict';
	var nodeStyle = function (node, parentStyle) {
		var style = {}, attachment, toStr = function (xmlObj) {
			return $('<div>').append(xmlObj).html();
		};
		if (node.attr('BACKGROUND_COLOR')) {
			style.style = {background : node.attr('BACKGROUND_COLOR')};
		}
		if ((parentStyle && parentStyle.collapsed) || node.attr('FOLDED') === 'true') {
			style.collapsed = 'true';
		}
		attachment = node.children('richcontent').find('body');
		if (attachment.length > 0) {
			style.attachment = { contentType: 'text/html', content: toStr(attachment.children()) };
		}
		return style;
	},
		result,
		xmlToJson = function (xmlNode, parentStyle) {
			var node = $(xmlNode),
				result = {'title' : node.attr('TEXT') || ''},
				childNodes = node.children('node'),
				style = nodeStyle(node, parentStyle),
				children = _.map(childNodes, function (child) {return xmlToJson(child, style); }),
				childObj = {},
				index = 1;
			if (_.size(style) > 0) {
				result.attr = style;
			}
			if (children.length > 0) {
				_.each(children, function (child) {
					var position = $(childNodes[index - 1]).attr('POSITION') === 'left' ? -1 : 1;
					childObj[position * index] = child;
					index += 1;
				});
				result.ideas = childObj;
			} else if (result.attr && result.attr.collapsed) {
				delete result.attr.collapsed;
			}
			if (progress) {
				progress();
			}
			return result;
		},
		xmlDoc = $($.parseXML(xml));
	if (start) {
		start(xmlDoc.find('node').length);
	}
	result = xmlToJson(xmlDoc.find('map').children('node').first());
	result.formatVersion = 2;
	return result;
};

/*jslint nomen: true*/
MM.freemindExport = function (idea) {
	'use strict';
	var formatNode = function (idea) {
		var escapedText = escape(idea.title).replace(/%([0-9A-F][0-9A-F])/g, '&#x$1;').replace(/%u([0-9A-F][0-9A-F][0-9A-F][0-9A-F])/g, '&#x$1;');
		return '<node ID="' + idea.id + '" TEXT="' + escapedText + '">' + (_.size(idea.ideas) > 0 ? _.map(_.sortBy(idea.ideas, function (val, key) { return parseFloat(key); }), formatNode).join('') : '') + '</node>';
	};
	return '<map version="0.7.1">' + formatNode(idea) + '</map>';
};
/*global MM, MAPJS, _, $, jQuery*/
MM.exportIdeas = function (contentAggregate, exporter) {
	'use strict';
	var traverse = function (iterator, idea, level) {
		level = level || 0;
		iterator(idea, level);
		_.each(idea.sortedSubIdeas(), function (subIdea) {
			traverse(iterator, subIdea, level + 1);
		});
	};
	if (exporter.begin) { exporter.begin(); }
	traverse(exporter.each, contentAggregate);
	if (exporter.end) { exporter.end(); }
	return exporter.contents();
};
MM.TabSeparatedTextExporter = function () {
	'use strict';
	var contents = [];
	this.contents = function () {
		return contents.join('\n');
	};
	this.each = function (idea, level) {
		contents.push(
			_.map(_.range(level), function () {return '\t'; }).join('') + idea.title.replace(/\t|\n|\r/g, ' ')
		);
	};
};
MM.HtmlTableExporter = function () {
	'use strict';
	var result;
	this.begin = function () {
		result = $('<table>').wrap('<div></div>'); /*parent needed for html generation*/
	};
	this.contents = function () {
		return '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"> </head><body>' +
			$(result).parent().html() +
			'</body></html>';
	};
	this.each = function (idea, level) {
		var row = $('<tr>').appendTo(result),
			cell = $('<td>').appendTo(row).text(idea.title);
		if (idea.attr && idea.attr.style && idea.attr.style.background) {
			cell.css('background-color', idea.attr.style.background);
			cell.css('color', MAPJS.contrastForeground(idea.attr.style.background));
		}
		if (level > 0) {
			$('<td>').prependTo(row).html('&nbsp;').attr('colspan', level);
		}
	};
};
MM.exportToHtmlDocument = function (idea) {
	'use strict';
	var deferred = jQuery.Deferred(),
		createContent = function (imageUrl) {
			var result = $('<div>'), /*parent needed for html generation*/
				appendLinkOrText = function (element, text) {
					if (MAPJS.URLHelper.containsLink(text)) {
						$('<a>').attr('href', MAPJS.URLHelper.getLink(text))
							.text(MAPJS.URLHelper.stripLink(text) || text)
							.appendTo(element);
					} else {
						element.text(text);
					}
				},
				appendAttachment = function (element, anIdea) {
					var attachment = anIdea && anIdea.attr && anIdea.attr.attachment;
					if (attachment && attachment.contentType === 'text/html') {
						$('<div>').addClass('attachment').appendTo(element).html(attachment.content);
					}
				},
				toList = function (ideaList) {
					var list = $('<ul>');
					_.each(ideaList, function (subIdea) {
						var element = $('<li>').appendTo(list);
						appendLinkOrText(element, subIdea.title);
						appendAttachment(element, subIdea);
						if (subIdea.attr && subIdea.attr.style && subIdea.attr.style.background) {
							element.css('background-color', subIdea.attr.style.background);
							element.css('color', MAPJS.contrastForeground(subIdea.attr.style.background));
						}
						if (!_.isEmpty(subIdea.ideas)) {
							toList(subIdea.sortedSubIdeas()).appendTo(element);
						}
					});
					return list;
				},
				heading = $('<h1>').appendTo(result);
			if (imageUrl) {
				$('<img>').addClass('mapimage').attr('src', imageUrl).appendTo(result);
			}
			appendLinkOrText(heading, idea.title);
			appendAttachment(result, idea);
			if (!_.isEmpty(idea.ideas)) {
				toList(idea.sortedSubIdeas()).appendTo(result);
			}
			deferred.resolve('<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">' +
				'<style type="text/css">' +
				'body{font-family:"HelveticaNeue",Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#333333;margin-left:10%;margin-right:10%;}h1{display:block;font-size:38.5px;line-height:40px;font-family:inherit;}li{line-height:20px;padding-left:10px;}ul{list-style-type:none;}div.attachment{border:1px solid black;margin:5px;padding:5px;}img.mapimage{border:1px solid black;max-height:600px;max-width:600px;}</style>' +
				'</head><body>' +
				$(result).html() +
				'</body></html>', 'text/html');
		};
	MAPJS.pngExport(idea).then(createContent);
	return deferred.promise();
};
/* http://github.com/mindmup/bootstrap-wysiwyg */
/*global jQuery, $, FileReader*/
/*jslint browser:true*/
jQuery(function ($) {
	'use strict';
	var readFileIntoDataUrl = function (fileInfo) {
		var loader = $.Deferred(),
			fReader = new FileReader();
		fReader.onload = function (e) {
			loader.resolve(e.target.result);
		};
		fReader.onerror = loader.reject;
		fReader.onprogress = loader.notify;
		fReader.readAsDataURL(fileInfo);
		return loader.promise();
	};
	$.fn.cleanHtml = function () {
		var html = $(this).html();
		return html && html.replace(/(<br>|\s|<div><br><\/div>|&nbsp;)*$/, '');
	};
	$.fn.wysiwyg = function (userOptions) {
		var editor = this,
			selectedRange,
			options,
			updateToolbar = function () {
				if (options.activeToolbarClass) {
					$(options.toolbarSelector).find('.btn[data-' + options.commandRole + ']').each(function () {
						var command = $(this).data(options.commandRole);
						if (document.queryCommandState(command)) {
							$(this).addClass(options.activeToolbarClass);
						} else {
							$(this).removeClass(options.activeToolbarClass);
						}
					});
				}
			},
			execCommand = function (commandWithArgs, valueArg) {
				var commandArr = commandWithArgs.split(' '),
					command = commandArr.shift(),
					args = commandArr.join(' ') + (valueArg || '');
				document.execCommand(command, 0, args);
				updateToolbar();
			},
			bindHotkeys = function (hotKeys) {
				$.each(hotKeys, function (hotkey, command) {
					editor.keydown(hotkey, function (e) {
						if (editor.attr('contenteditable') && editor.is(':visible')) {
							e.preventDefault();
							e.stopPropagation();
							execCommand(command);
						}
					}).keyup(hotkey, function (e) {
						if (editor.attr('contenteditable') && editor.is(':visible')) {
							e.preventDefault();
							e.stopPropagation();
						}
					});
				});
			},
			getCurrentRange = function () {
				var sel = window.getSelection();
				if (sel.getRangeAt && sel.rangeCount) {
					return sel.getRangeAt(0);
				}
			},
			saveSelection = function () {
				selectedRange = getCurrentRange();
			},
			restoreSelection = function () {
				var selection = window.getSelection();
				if (selectedRange) {
					try {
						selection.removeAllRanges();
					} catch (ex) {
						var textRange = document.body.createTextRange();
						textRange.select();
						document.selection.empty();
					}
					selection.addRange(selectedRange);
				}
			},
			insertFiles = function (files) {
				editor.focus();
				$.each(files, function (idx, fileInfo) {
					if (/^image\//.test(fileInfo.type)) {
						$.when(readFileIntoDataUrl(fileInfo)).done(function (dataUrl) {
							execCommand('insertimage', dataUrl);
						});
					}
				});
			},
			markSelection = function (input, color) {
				restoreSelection();
				document.execCommand('hiliteColor', 0, color || 'transparent');
				saveSelection();
				input.data(options.selectionMarker, color);
			},
			bindToolbar = function (toolbar, options) {
				toolbar.find('a[data-' + options.commandRole + ']').click(function () {
					restoreSelection();
					editor.focus();
					execCommand($(this).data(options.commandRole));
					saveSelection();
				});
				toolbar.find('[data-toggle=dropdown]').click(restoreSelection);
				toolbar.find('input[type=text][data-' + options.commandRole + ']').on('webkitspeechchange change', function () {
					var newValue = this.value; /* ugly but prevents fake double-calls due to selection restoration */
					this.value = '';
					restoreSelection();
					if (newValue) {
						editor.focus();
						execCommand($(this).data(options.commandRole), newValue);
					}
					saveSelection();
				}).on('focus', function () {
					var input = $(this);
					if (!input.data(options.selectionMarker)) {
						markSelection(input, options.selectionColor);
						input.focus();
					}
				}).on('blur', function () {
					var input = $(this);
					if (input.data(options.selectionMarker)) {
						markSelection(input, false);
					}
				});
				toolbar.find('input[type=file][data-' + options.commandRole + ']').change(function () {
					restoreSelection();
					if (this.type === 'file' && this.files && this.files.length > 0) {
						insertFiles(this.files);
					}
					saveSelection();
					this.value = '';
				});
			},
			initFileDrops = function () {
				editor.on('dragenter dragover', false)
					.on('drop', function (e) {
						var dataTransfer = e.originalEvent.dataTransfer;
						e.stopPropagation();
						e.preventDefault();
						if (dataTransfer && dataTransfer.files && dataTransfer.files.length > 0) {
							insertFiles(dataTransfer.files);
						}
					});
			};
		options = $.extend({}, $.fn.wysiwyg.defaults, userOptions);
		bindHotkeys(options.hotKeys);
		initFileDrops();
		bindToolbar($(options.toolbarSelector), options);
		editor.attr('contenteditable', true)
			.on('mouseup keyup mouseout', function () {
				saveSelection();
				updateToolbar();
			});
		$(window).bind('touchend', function (e) {
			var isInside = (editor.is(e.target) || editor.has(e.target).length > 0),
				currentRange = getCurrentRange(),
				clear = currentRange && (currentRange.startContainer === currentRange.endContainer && currentRange.startOffset === currentRange.endOffset);
			if (!clear || isInside) {
				saveSelection();
				updateToolbar();
			}
		});
		return this;
	};
	$.fn.wysiwyg.defaults = {
		hotKeys: {
			'ctrl+b meta+b': 'bold',
			'ctrl+i meta+i': 'italic',
			'ctrl+u meta+u': 'underline',
			'ctrl+z meta+z': 'undo',
			'ctrl+y meta+y meta+shift+z': 'redo',
			'ctrl+l meta+l': 'justifyleft',
			'ctrl+r meta+r': 'justifyright',
			'ctrl+e meta+e': 'justifycenter',
			'ctrl+j meta+j': 'justifyfull',
			'shift+tab': 'outdent',
			'tab': 'indent'
		},
		toolbarSelector: '[data-role=editor-toolbar]',
		commandRole: 'edit',
		activeToolbarClass: 'btn-info',
		selectionMarker: 'edit-focus-marker',
		selectionColor: 'darkgrey'
	};
});
/*global $*/
/*jslint browser:true*/
$.fn.attachmentEditorWidget = function (mapModel, isTouch) {
	'use strict';
	var element = this,
		shader = $('<div>').addClass('modal-backdrop fade in hide').appendTo('body'),
		editorArea = element.find('[data-mm-role=editor]'),
		ideaId,
		close = function () {
			shader.hide();
			mapModel.setInputEnabled(true);
			element.hide();
			editorArea.html('');
		},
		isEditing,
		switchToEditMode = function () {
			editorArea.attr('contenteditable', true);
			element.addClass('mm-editable');
			editorArea.focus();
			isEditing = true;
		},
		switchToViewMode = function () {
			element.removeClass('mm-editable');
			editorArea.attr('contenteditable', false);
			editorArea.find('a').attr('target', '_blank');
			isEditing = false;
			editorArea.focus();
		},
		save = function () {
			var newContent = editorArea.cleanHtml();
			if (newContent) {
				mapModel.setAttachment('attachmentEditorWidget', ideaId, {contentType: 'text/html', content: newContent });
				close();
			} else {
				mapModel.setAttachment('attachmentEditorWidget', ideaId, false);
				close();
			}
		},
		clear = function () {
			editorArea.html('');
		},
		sizeEditor = function () {
			var margin = editorArea.outerHeight(true) - editorArea.innerHeight() + 30;
			editorArea.height(element.innerHeight() - editorArea.siblings().outerHeight(true) - margin);
			$('[data-role=editor-toolbar] [data-role=magic-overlay]').each(function () {
				var overlay = $(this), target = $(overlay.data('target'));
				overlay.css('opacity', 0).css('position', 'absolute')
					.offset(target.offset()).width(target.outerWidth()).height(target.outerHeight());
			});
			shader.width('100%').height('100%');
		},

		open = function (activeIdea, attachment) {
			var contentType = attachment && attachment.contentType;
			shader.show();
			ideaId = activeIdea;
			element.show();
			sizeEditor();
			mapModel.setInputEnabled(false);
			if (!attachment) {
				switchToEditMode();
			} else if (contentType === 'text/html') {
				editorArea.html(attachment && attachment.content);
				switchToViewMode();
			}
		},
		initToolbar = function () {
			var fonts = ['Serif', 'Sans', 'Arial', 'Arial Black', 'Courier',
				'Courier New', 'Comic Sans MS', 'Helvetica', 'Impact', 'Lucida Grande', 'Lucida Sans', 'Tahoma', 'Times',
				'Times New Roman', 'Verdana'],
				fontTarget = $('[data-role=editor-toolbar] [data-mm-role=font]');
			$.each(fonts, function (idx, fontName) {
				fontTarget.append($('<li><a data-edit="fontName ' + fontName + '" style="font-family:' + fontName + '">' + fontName + '</a></li>'));
			});
			$('[data-role=editor-toolbar] .dropdown-menu input')
				.click(function () {return false; })
				.change(function () {$(this).parent('.dropdown-menu').siblings('.dropdown-toggle').dropdown('toggle'); })
				.keydown('esc', function () { this.value = ''; $(this).change(); });
			$('[data-role=editor-toolbar] a')
				.attr('data-category', 'Attachment editor toolbar')
				.attr('data-event-type', function () {
					return $(this).attr('data-edit') || $(this).attr('title') || $(this).text() || 'unknown';
				});
		};
	if (isTouch) {
		editorArea.detach().prependTo(element);
	}
	initToolbar();
	editorArea.wysiwyg();
	element.addClass('mm-editable');
	element.find('[data-mm-role=save]').click(save);
	element.find('[data-mm-role=close]').click(close);
	element.find('[data-mm-role=clear]').click(clear);
	element.find('[data-mm-role=edit]').click(switchToEditMode);
	$(document).keydown('esc', function () {
		if (element.is(':visible')) {
			close();
		}
	}).keydown('ctrl+s meta+s', function (e) {
		if (element.is(':visible')) {
			e.preventDefault();
			save();
			close();
		}
	}).keydown('ctrl+return meta+return', function () {
		if (element.is(':visible')) {
			if (isEditing) {
				save();
			} else {
				switchToEditMode();
			}
		}
	});
	$(window).bind('orientationchange resize', sizeEditor);
	mapModel.addEventListener('attachmentOpened', open);
	return element;
};
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
/*global jQuery*/
jQuery.fn.autoSaveWidget = function (autoSave) {
	'use strict';
	var self = this;
	autoSave.addEventListener('unsavedChangesAvailable', function () {
		self.modal('show');
	});
	self.find('[data-mm-role=apply]').click(function () {
		autoSave.applyUnsavedChanges();
		self.modal('hide');
	});
	self.find('[data-mm-role=discard]').click(function () {
		autoSave.discardUnsavedChanges();
		self.modal('hide');
	});
};
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
/*global document, jQuery*/
jQuery.fn.scoreWidget = function (activityLog, alert, timeout, storage, storageKey, currentCohort) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this),
			send = function () {
				var val = element.find('button.active').val();
				if (val) {
					activityLog.log('Score', 'send-modal');
					activityLog.log('Score', val, element.find('[name=why]').val());
					element.modal('hide');
				} else {
					element.find('button').effect('pulsate');
				}
				return false;
			},
		    dateToYMD = function (millis) {
				var date = new Date(millis),
					d = date.getDate(),
					m = date.getMonth() + 1,
					y = date.getFullYear();
				return String('') + y + (m <= 9 ? '0' + m : m) + (d <= 9 ? '0' + d : d);
			},
		    alertId,
			showIfNeeded = function () {
				var now = Date.now();
				/*jslint eqeq:true*/
				if (storage[storageKey] || currentCohort != dateToYMD(now)) {
					return;
				}
				activityLog.log('Score', 'show-modal-alert');
				alertId = alert.show('Please help us improve!', '<a data-toggle="modal" data-target="#modalScore">Click here to answer one very quick question</a>, we would appreciate that very much', 'warning');
				storage[storageKey] = now;
			};
		element.on('show', function () {
			activityLog.log('Score', 'show-modal');
			if (alertId) {
				alert.hide(alertId);
			}
			element.find('button').removeClass('active');
			element.find('[name=why]').val('');
		});
		element.find('[data-mm-role=send]').click(send);
		element.find('form').submit(send);
		setTimeout(showIfNeeded, timeout * 1000);
	});
};
/*global document, jQuery*/
jQuery.fn.scoreAlertWidget = function (activityLog, alert, timeout, storage, storageKey, currentCohort) {
	'use strict';
	return this.each(function () {
		var template = jQuery(this).html(),
			element,
		    now = Date.now(),
			send = function () {
				var val = element.find('button.active').val();
				if (val) {
					activityLog.log('Score', 'send-alert');
					activityLog.log('Score', val, element.find('[name=why]').val());
					element.hide();
				} else {
					element.find('button').effect('pulsate');
				}
				return false;
			},
		    dateToYMD = function (millis) {
				var date = new Date(millis),
					d = date.getDate(),
					m = date.getMonth() + 1,
					y = date.getFullYear();
				return String('') + y + (m <= 9 ? '0' + m : m) + (d <= 9 ? '0' + d : d);
			},
		    alertId,
			show = function () {
				activityLog.log('Score', 'show-alert');
				alertId = alert.show('Will you visit MindMup again in the next 7 days?', template, 'warning');
				element = jQuery('.alert-no-' + alertId);
				storage[storageKey] = now;
				element.find('form').submit(send);
			};
		/*jslint eqeq:true*/
		if (storage[storageKey] || currentCohort != dateToYMD(now)) {
			return;
		}
		setTimeout(show, timeout * 1000);
	});
};
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


/*global jQuery, window, _*/
jQuery.fn.mapStatusWidget = function (mapController) {
	'use strict';
	var element = this,
		oldIdea,
		updateSharable = function (sharable) {
			if (sharable) {
				element.removeClass('map-not-sharable').addClass('map-sharable');
			} else {
				element.removeClass('map-sharable').addClass('map-not-sharable');
			}
		},
		rebindIfChanged = function (idea, autoSave) {
			if (oldIdea !== idea) {
				oldIdea = idea;
				if (!autoSave) {
					idea.addEventListener('changed', function () {
						if (element.hasClass('map-unchanged')) {
							element.removeClass('map-unchanged').addClass('map-changed');
							element.removeClass('map-sharable').addClass('map-not-sharable');
						}

					});
				}
			}
		};
	mapController.addEventListener('mapSaved mapLoaded', function (mapId, idea, properties) {
		if (!properties.editable) { /* imported, no repository ID */
			jQuery('body').removeClass('map-unchanged').addClass('map-changed');
		} else {
			element.removeClass('map-changed').addClass('map-unchanged');
		}
		rebindIfChanged(idea, properties.autoSave);
		element.removeClass(_.filter(element.attr('class').split(' '), function (css) { return (/^map-source-/).test(css); }).join(' '));
		if (mapId) {
			element.addClass('map-source-' + mapId[0]);
		}
		updateSharable(properties.sharable);
	});
	jQuery(window).bind('beforeunload', function () {
		if (mapController.isMapLoadingConfirmationRequired()) {
			return 'There are unsaved changes.';
		}
	});
};
$.fn.keyActionsWidget = function () {
	var element = this;
	this.find('[data-mm-role=dismiss-modal]').click(function () { element.modal('hide');});
	element.on('show', function () {
		element.find('.active').removeClass('active');
		element.find('.carousel-inner').children('.item').first().addClass('active');
	});
}
/*global jQuery,document, _*/
jQuery.fn.contextMenuWidget = function (mapModel) {
	'use strict';
	var content = this.find('[data-mm-context-menu]').clone(),
		element = jQuery('<ul class="dropdown-menu">').css('position', 'absolute').css('z-index', '999').hide().appendTo('body'),
		hide = function () {
			if (element.is(':visible')) {
				element.hide();
			}
			jQuery(document).off('click touch keydown', hide);
		},
		topMenus = { },
		getTopMenu = function (label) {
			if (!topMenus[label]) {
				var dropDownMenu = jQuery('<li class="dropdown-submenu"><a tabindex="-1" href="#"></a><ul class="dropdown-menu"></ul></li>').appendTo(element);
				dropDownMenu.find('a').text(label);
				topMenus[label] = dropDownMenu.find('ul');
			}
			return topMenus[label];
		};
	content.find('a').attr('data-category', 'Context Menu');
	_.each(content, function (menuItem) {
		var submenu = jQuery(menuItem).attr('data-mm-context-menu');

		if (submenu) {
			getTopMenu(submenu).append(menuItem);
		} else {
			element.append(menuItem);
		}
	});
	mapModel.addEventListener('mapMoveRequested mapScaleChanged nodeSelectionChanged nodeEditRequested', hide);
	mapModel.addEventListener('contextMenuRequested', function (nodeId, x, y) {
		element.css('left', x).css('top', y - 10).css('display', 'block').show();
		if (element.offset().top + element.outerHeight() > jQuery(window).height() - 20) {
			element.css('top', jQuery(window).height() - 20 - element.outerHeight());
		}
		if (element.offset().left + (2 * element.outerWidth()) > jQuery(window).width() - 20) {
			element.find('.dropdown-submenu').addClass('pull-left');
		} else {
			element.find('.dropdown-submenu').removeClass('pull-left');
		}
		if (element.offset().left + (element.outerWidth()) > jQuery(window).width() - 20) {
			element.css('left', jQuery(window).width() - 20 - (element.outerWidth()));
		}
		jQuery(document).off('click', hide);
		element.on('mouseenter', function () {
			jQuery(document).off('click', hide);
		});
		element.on('mouseout', function () {
			jQuery(document).on('click', hide);
		});
		jQuery(document).on('touch keydown', hide);
	});
	return element;
};
/*global jQuery, document, escape*/
jQuery.fn.embedMapWidget = function (mapController) {
	'use strict';
	var element = this,
		textArea = element.find('textarea'),
		templateText = textArea.val().trim(),
		selectText = function () {
			if (textArea[0].setSelectionRange) {
				textArea[0].setSelectionRange(0, textArea[0].value.length);
			} else {
				textArea[0].select();
			}
			textArea.focus();
			return false;
		};
	textArea.click(selectText);
	element.on('show', function () {
		element.find('textarea').val(
			templateText.replace(/MAPID/g, mapController.currentMapId())
				.replace(/TITLE/g, (document.title || '').replace(/"/g, '&quot;'))
		);
	});
	element.on('shown', function () {
		selectText();
	});
	return element;
};
/*jslint nomen: true*/
/*global _gaq, document, jQuery, MM, MAPJS, window*/
MM.main = function (config) {
	'use strict';
	var getStorage = function () {
			try {
				window.localStorage.setItem('testkey', 'testval');
				if (window.localStorage.getItem('testkey') === 'testval') {

					return window.localStorage;
				}
			} catch (e) {
			}
			return {
				fake: true,
				getItem: function (key) { return this[key]; },
				setItem: function (key, val) { this[key] = val; },
				removeItem: function (key) { delete this[key]; }
			};
		},
		browserStorage = getStorage(),
		mapModelAnalytics = false,
		setupTracking = function (activityLog, jotForm, mapModel) {
			activityLog.addEventListener('log', function () { _gaq.push(['_trackEvent'].concat(Array.prototype.slice.call(arguments, 0, 3))); });
			activityLog.addEventListener('error', function (message) {
				jotForm.sendError(message, activityLog.getLog());
			});
			if (mapModelAnalytics) {
				mapModel.addEventListener('analytic', activityLog.log);
			}
		};
	window._gaq = [['_setAccount', config.googleAnalyticsAccount],
		['_setCustomVar', 1, 'User Cohort', config.userCohort, 1],
		['_setCustomVar', 2, 'Active Extensions', browserStorage['active-extensions'], 1],
		['_trackPageview']
			];
	jQuery(function () {
		var activityLog = new MM.ActivityLog(10000),
			oldShowPalette,
			alert = new MM.Alert(),
			objectStorage = MM.jsonStorage(browserStorage),
			jotForm = new MM.JotForm(jQuery('#modalFeedback form'), alert),
			s3Adapter = new MM.S3Adapter(config.s3Url, config.s3Folder, activityLog, config.publishingConfigUrl, config.baseUrl + config.proxyLoadUrl),
			googleDriveAdapter = new MM.GoogleDriveAdapter(config.googleAppId, config.googleClientId, config.googleApiKey, config.networkTimeoutMillis, 'application/json'),
			offlineMapStorage = new MM.OfflineMapStorage(objectStorage, 'offline'),
			offlineAdapter = new MM.OfflineAdapter(offlineMapStorage),
			mapController = new MM.MapController([
				new MM.RetriableMapSourceDecorator(new MM.FileSystemMapSource(s3Adapter)),
				new MM.RetriableMapSourceDecorator(new MM.FileSystemMapSource(googleDriveAdapter)),
				new MM.FileSystemMapSource(offlineAdapter),
				new MM.EmbeddedMapSource()
			]),
			navigation = MM.navigation(browserStorage, mapController),
			mapModel = new MAPJS.MapModel(MAPJS.KineticMediator.layoutCalculator, [''], ['']),
			mapBookmarks = new MM.Bookmark(mapController, objectStorage, 'created-maps'),
			autoSave = new MM.AutoSave(mapController, objectStorage, alert),
			extensions = new MM.Extensions(browserStorage, 'active-extensions', config, {
				'googleDriveAdapter': googleDriveAdapter,
				'alert': alert,
				'mapController': mapController,
				'activityLog': activityLog,
				'mapModel': mapModel,
				'container': jQuery('#container')
			}),
			loadWidgets = function () {
				if (!config.isTouch) {
					jQuery('[rel=tooltip]').tooltip();
				}
				jQuery('body').mapStatusWidget(mapController);
				jQuery('#container').mapWidget(activityLog, mapModel, config.isTouch, false);
				jQuery('#welcome_message[data-message]').welcomeMessageWidget(activityLog);
				jQuery('#topbar').mapToolbarWidget(mapModel);

				oldShowPalette = jQuery.fn.colorPicker.showPalette;
				jQuery.fn.colorPicker.showPalette = function (palette) {
					oldShowPalette(palette);
					if (palette.hasClass('topbar-color-picker')) {
						palette.css('top', jQuery('#topbar').outerHeight());
					}
				};
				jQuery('#modalFeedback').feedbackWidget(jotForm, activityLog);
				jQuery('#modalVote').voteWidget(activityLog, alert);
				jQuery('#toolbarEdit').mapToolbarWidget(mapModel);
				jQuery('#floating-toolbar').floatingToolbarWidget();
				jQuery('#listBookmarks').bookmarkWidget(mapBookmarks, alert, mapController);
				jQuery(document).titleUpdateWidget(mapController);
				jQuery('[data-mm-role=share]').shareWidget();
				jQuery('#modalShareEmail').shareEmailWidget();
				jQuery('[data-mm-role=share-google]').googleShareWidget(mapController, googleDriveAdapter);
				jQuery('[data-mm-role=share]').add('[data-mm-role=short-url]').urlShortenerWidget(config.googleApiKey, activityLog, mapController, config.baseUrl);
				jQuery('#modalImport').importWidget(activityLog, mapController);
				jQuery('[data-mm-role=save]').saveWidget(mapController);
				jQuery('[data-mm-role="toggle-class"]').toggleClassWidget();
				jQuery('[data-mm-role="remote-export"]').remoteExportWidget(mapController, alert);
				jQuery('#modalGoogleOpen').googleDriveOpenWidget(googleDriveAdapter, mapController);
				jQuery('#modalLocalStorageOpen').localStorageOpenWidget(offlineMapStorage, mapController);
				jQuery('body')
					.commandLineWidget('Shift+Space Ctrl+Space', mapModel);
				jQuery('#modalAttachmentEditor').attachmentEditorWidget(mapModel, config.isTouch);
				jQuery('#modalAutoSave').autoSaveWidget(autoSave);
				jQuery('#modalEmbedMap').embedMapWidget(mapController);
				jQuery('#linkEditWidget').linkEditWidget(mapModel);
				jQuery('#modalExtensions').extensionsWidget(extensions, mapController, alert);
				jQuery('#nodeContextMenu').contextMenuWidget(mapModel).mapToolbarWidget(mapModel);
				jQuery('.dropdown-submenu>a').click(function () { return false; });
				jQuery('[data-category]').trackingWidget(activityLog);
				jQuery('.modal')
					.on('show', mapModel.setInputEnabled.bind(mapModel, false))
					.on('hide', mapModel.setInputEnabled.bind(mapModel, true));
				jQuery('#modalKeyActions').keyActionsWidget();
				jQuery('#topbar .updateStyle').attr('data-mm-align', 'top').colorPicker();
				jQuery('.colorPicker-palette').addClass('topbar-color-picker');
				jQuery('.updateStyle[data-mm-align!=top]').colorPicker();
				jQuery('.colorPicker-picker').parent('a,button').click(function (e) { if (e.target === this) {jQuery(this).find('.colorPicker-picker').click(); } });
			};
		config.isTouch = jQuery('body').hasClass('ios') || jQuery('body').hasClass('android');
		MM.OfflineMapStorageBookmarks(offlineMapStorage, mapBookmarks);
		jQuery.support.cors = true;
		setupTracking(activityLog, jotForm, mapModel);
		jQuery('body').classCachingWidget('cached-classes', browserStorage);
		MM.MapController.activityTracking(mapController, activityLog);
		MM.MapController.alerts(mapController, alert);
		mapController.addEventListener('mapLoaded', function (mapId, idea) {
			mapModel.setIdea(idea);
		});
		if (browserStorage.fake) {
			alert.show('Browser storage unavailable!', 'You might be running the app in private mode or have no browser storage - some features of this application will not work fully.', 'warning');
			activityLog.log('Warning', 'Local storage not available');
		}
		jQuery('#topbar').alertWidget(alert);
		extensions.load(navigation.initialMapId()).then(function () {
			jQuery('[data-mm-clone]').each(function () {
				var element = jQuery(this),
					toClone = jQuery(element.data('mm-clone'));
				toClone.children().clone(true).appendTo(element);
				element.attr('data-mm-role', toClone.attr('data-mm-role'));
			});
			loadWidgets();
			if (!navigation.loadInitial()) {
				jQuery('#logo-img').click();
			}
		});
	});

};
