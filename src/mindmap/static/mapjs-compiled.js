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
				'insert': 'addSubIdea',
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
				'shift+insert': 'insertIntermediate',
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
