(function () {
  'use strict';

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  var EditType;
  (function (EditType) {
      // The values must be kept in sync with the .NET equivalent in RenderTreeEditType.cs
      EditType[EditType["prependFrame"] = 1] = "prependFrame";
      EditType[EditType["removeFrame"] = 2] = "removeFrame";
      EditType[EditType["setAttribute"] = 3] = "setAttribute";
      EditType[EditType["removeAttribute"] = 4] = "removeAttribute";
      EditType[EditType["updateText"] = 5] = "updateText";
      EditType[EditType["stepIn"] = 6] = "stepIn";
      EditType[EditType["stepOut"] = 7] = "stepOut";
      EditType[EditType["updateMarkup"] = 8] = "updateMarkup";
      EditType[EditType["permutationListEntry"] = 9] = "permutationListEntry";
      EditType[EditType["permutationListEnd"] = 10] = "permutationListEnd";
  })(EditType || (EditType = {}));
  var FrameType;
  (function (FrameType) {
      // The values must be kept in sync with the .NET equivalent in RenderTreeFrameType.cs
      FrameType[FrameType["element"] = 1] = "element";
      FrameType[FrameType["text"] = 2] = "text";
      FrameType[FrameType["attribute"] = 3] = "attribute";
      FrameType[FrameType["component"] = 4] = "component";
      FrameType[FrameType["region"] = 5] = "region";
      FrameType[FrameType["elementReferenceCapture"] = 6] = "elementReferenceCapture";
      FrameType[FrameType["markup"] = 8] = "markup";
      FrameType[FrameType["namedEvent"] = 10] = "namedEvent";
  })(FrameType || (FrameType = {}));

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  class EventFieldInfo {
      constructor(componentId, fieldValue) {
          this.componentId = componentId;
          this.fieldValue = fieldValue;
      }
      static fromEvent(componentId, event) {
          const elem = event.target;
          if (elem instanceof Element) {
              const fieldData = getFormFieldData(elem);
              if (fieldData) {
                  return new EventFieldInfo(componentId, fieldData.value);
              }
          }
          // This event isn't happening on a form field that we can reverse-map back to some incoming attribute
          return null;
      }
  }
  function getFormFieldData(elem) {
      // The logic in here should be the inverse of the logic in BrowserRenderer's tryApplySpecialProperty.
      // That is, we're doing the reverse mapping, starting from an HTML property and reconstructing which
      // "special" attribute would have been mapped to that property.
      if (elem instanceof HTMLInputElement) {
          return (elem.type && elem.type.toLowerCase() === 'checkbox')
              ? { value: elem.checked }
              : { value: elem.value };
      }
      if (elem instanceof HTMLSelectElement || elem instanceof HTMLTextAreaElement) {
          return { value: elem.value };
      }
      return null;
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const eventTypeRegistry = new Map();
  const browserEventNamesToAliases = new Map();
  const createBlankEventArgsOptions = { createEventArgs: () => ({}) };
  const eventNameAliasRegisteredCallbacks = [];
  function registerCustomEventType(eventName, options) {
      if (!options) {
          throw new Error('The options parameter is required.');
      }
      // There can't be more than one registration for the same event name because then we wouldn't
      // know which eventargs data to supply.
      if (eventTypeRegistry.has(eventName)) {
          throw new Error(`The event '${eventName}' is already registered.`);
      }
      // If applicable, register this as an alias of the given browserEventName
      if (options.browserEventName) {
          const aliasGroup = browserEventNamesToAliases.get(options.browserEventName);
          if (aliasGroup) {
              aliasGroup.push(eventName);
          }
          else {
              browserEventNamesToAliases.set(options.browserEventName, [eventName]);
          }
          // For developer convenience, it's allowed to register the custom event type *after*
          // some listeners for it are already present. Once the event name alias gets registered,
          // we have to notify any existing event delegators so they can update their delegated
          // events list.
          eventNameAliasRegisteredCallbacks.forEach(callback => callback(eventName, options.browserEventName));
      }
      eventTypeRegistry.set(eventName, options);
  }
  function getEventTypeOptions(eventName) {
      return eventTypeRegistry.get(eventName);
  }
  function getEventNameAliases(eventName) {
      return browserEventNamesToAliases.get(eventName);
  }
  function getBrowserEventName(possibleAliasEventName) {
      const eventOptions = eventTypeRegistry.get(possibleAliasEventName);
      return eventOptions?.browserEventName || possibleAliasEventName;
  }
  function registerBuiltInEventType(eventNames, options) {
      eventNames.forEach(eventName => eventTypeRegistry.set(eventName, options));
  }
  registerBuiltInEventType(['input', 'change'], {
      createEventArgs: parseChangeEvent,
  });
  registerBuiltInEventType([
      'copy',
      'cut',
      'paste',
  ], {
      createEventArgs: e => parseClipboardEvent(e),
  });
  registerBuiltInEventType([
      'drag',
      'dragend',
      'dragenter',
      'dragleave',
      'dragover',
      'dragstart',
      'drop',
  ], {
      createEventArgs: e => parseDragEvent(e),
  });
  registerBuiltInEventType([
      'focus',
      'blur',
      'focusin',
      'focusout',
  ], {
      createEventArgs: e => parseFocusEvent(e),
  });
  registerBuiltInEventType([
      'keydown',
      'keyup',
      'keypress',
  ], {
      createEventArgs: e => parseKeyboardEvent(e),
  });
  registerBuiltInEventType([
      'contextmenu',
      'click',
      'mouseover',
      'mouseout',
      'mousemove',
      'mousedown',
      'mouseup',
      'mouseleave',
      'mouseenter',
      'dblclick',
  ], {
      createEventArgs: e => parseMouseEvent(e),
  });
  registerBuiltInEventType(['error'], {
      createEventArgs: e => parseErrorEvent(e),
  });
  registerBuiltInEventType([
      'loadstart',
      'timeout',
      'abort',
      'load',
      'loadend',
      'progress',
  ], {
      createEventArgs: e => parseProgressEvent(e),
  });
  registerBuiltInEventType([
      'touchcancel',
      'touchend',
      'touchmove',
      'touchenter',
      'touchleave',
      'touchstart',
  ], {
      createEventArgs: e => parseTouchEvent(e),
  });
  registerBuiltInEventType([
      'gotpointercapture',
      'lostpointercapture',
      'pointercancel',
      'pointerdown',
      'pointerenter',
      'pointerleave',
      'pointermove',
      'pointerout',
      'pointerover',
      'pointerup',
  ], {
      createEventArgs: e => parsePointerEvent(e),
  });
  registerBuiltInEventType(['wheel', 'mousewheel'], {
      createEventArgs: e => parseWheelEvent(e),
  });
  registerBuiltInEventType(['cancel', 'close', 'toggle'], createBlankEventArgsOptions);
  function parseChangeEvent(event) {
      const element = event.target;
      if (isTimeBasedInput(element)) {
          const normalizedValue = normalizeTimeBasedValue(element);
          return { value: normalizedValue };
      }
      else if (isMultipleSelectInput(element)) {
          const selectElement = element;
          const selectedValues = Array.from(selectElement.options)
              .filter(option => option.selected)
              .map(option => option.value);
          return { value: selectedValues };
      }
      else {
          const targetIsCheckbox = isCheckbox(element);
          const newValue = targetIsCheckbox ? !!element['checked'] : element['value'];
          return { value: newValue };
      }
  }
  function parseWheelEvent(event) {
      return {
          ...parseMouseEvent(event),
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          deltaMode: event.deltaMode,
      };
  }
  function parsePointerEvent(event) {
      return {
          ...parseMouseEvent(event),
          pointerId: event.pointerId,
          width: event.width,
          height: event.height,
          pressure: event.pressure,
          tiltX: event.tiltX,
          tiltY: event.tiltY,
          pointerType: event.pointerType,
          isPrimary: event.isPrimary,
      };
  }
  function parseTouchEvent(event) {
      return {
          detail: event.detail,
          touches: parseTouch(event.touches),
          targetTouches: parseTouch(event.targetTouches),
          changedTouches: parseTouch(event.changedTouches),
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          type: event.type,
      };
  }
  function parseFocusEvent(event) {
      return {
          type: event.type,
      };
  }
  function parseClipboardEvent(event) {
      return {
          type: event.type,
      };
  }
  function parseProgressEvent(event) {
      return {
          lengthComputable: event.lengthComputable,
          loaded: event.loaded,
          total: event.total,
          type: event.type,
      };
  }
  function parseErrorEvent(event) {
      return {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          type: event.type,
      };
  }
  function parseKeyboardEvent(event) {
      return {
          key: event.key,
          code: event.code,
          location: event.location,
          repeat: event.repeat,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          type: event.type,
          isComposing: event.isComposing,
      };
  }
  function parseDragEvent(event) {
      return {
          ...parseMouseEvent(event),
          dataTransfer: event.dataTransfer ? {
              dropEffect: event.dataTransfer.dropEffect,
              effectAllowed: event.dataTransfer.effectAllowed,
              files: Array.from(event.dataTransfer.files).map(f => f.name),
              items: Array.from(event.dataTransfer.items).map(i => ({ kind: i.kind, type: i.type })),
              types: event.dataTransfer.types,
          } : null,
      };
  }
  function parseTouch(touchList) {
      const touches = [];
      for (let i = 0; i < touchList.length; i++) {
          const touch = touchList[i];
          touches.push({
              identifier: touch.identifier,
              clientX: touch.clientX,
              clientY: touch.clientY,
              screenX: touch.screenX,
              screenY: touch.screenY,
              pageX: touch.pageX,
              pageY: touch.pageY,
          });
      }
      return touches;
  }
  function parseMouseEvent(event) {
      return {
          detail: event.detail,
          screenX: event.screenX,
          screenY: event.screenY,
          clientX: event.clientX,
          clientY: event.clientY,
          offsetX: event.offsetX,
          offsetY: event.offsetY,
          pageX: event.pageX,
          pageY: event.pageY,
          movementX: event.movementX,
          movementY: event.movementY,
          button: event.button,
          buttons: event.buttons,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          type: event.type,
      };
  }
  function isCheckbox(element) {
      return !!element && element.tagName === 'INPUT' && element.getAttribute('type') === 'checkbox';
  }
  const timeBasedInputs = [
      'date',
      'datetime-local',
      'month',
      'time',
      'week',
  ];
  function isTimeBasedInput(element) {
      return timeBasedInputs.indexOf(element.getAttribute('type')) !== -1;
  }
  function isMultipleSelectInput(element) {
      return element instanceof HTMLSelectElement && element.type === 'select-multiple';
  }
  function normalizeTimeBasedValue(element) {
      const value = element.value;
      const type = element.type;
      switch (type) {
          case 'date':
          case 'month':
              return value;
          case 'datetime-local':
              return value.length === 16 ? value + ':00' : value; // Convert yyyy-MM-ddTHH:mm to yyyy-MM-ddTHH:mm:00
          case 'time':
              return value.length === 5 ? value + ':00' : value; // Convert hh:mm to hh:mm:00
          case 'week':
              // For now we are not going to normalize input type week as it is not trivial
              return value;
      }
      throw new Error(`Invalid element type '${type}'.`);
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  // This is a single-file self-contained module to avoid the need for a Webpack build
  var DotNet;
  (function (DotNet) {
      const jsonRevivers = [];
      const jsObjectIdKey = "__jsObjectId";
      const dotNetObjectRefKey = "__dotNetObject";
      const byteArrayRefKey = "__byte[]";
      const dotNetStreamRefKey = "__dotNetStream";
      const jsStreamReferenceLengthKey = "__jsStreamReferenceLength";
      // If undefined, no dispatcher has been attached yet.
      // If null, this means more than one dispatcher was attached, so no default can be determined.
      // Otherwise, there was only one dispatcher registered. We keep track of this instance to keep legacy APIs working.
      let defaultCallDispatcher;
      // Provides access to the "current" call dispatcher without having to flow it through nested function calls.
      let currentCallDispatcher;
      class JSObject {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          constructor(_jsObject) {
              this._jsObject = _jsObject;
              this._cachedFunctions = new Map();
          }
          findFunction(identifier) {
              const cachedFunction = this._cachedFunctions.get(identifier);
              if (cachedFunction) {
                  return cachedFunction;
              }
              let result = this._jsObject;
              let lastSegmentValue;
              identifier.split(".").forEach(segment => {
                  if (segment in result) {
                      lastSegmentValue = result;
                      result = result[segment];
                  }
                  else {
                      throw new Error(`Could not find '${identifier}' ('${segment}' was undefined).`);
                  }
              });
              if (result instanceof Function) {
                  result = result.bind(lastSegmentValue);
                  this._cachedFunctions.set(identifier, result);
                  return result;
              }
              throw new Error(`The value '${identifier}' is not a function.`);
          }
          getWrappedObject() {
              return this._jsObject;
          }
      }
      const windowJSObjectId = 0;
      const cachedJSObjectsById = {
          [windowJSObjectId]: new JSObject(window)
      };
      cachedJSObjectsById[windowJSObjectId]._cachedFunctions.set("import", (url) => {
          // In most cases developers will want to resolve dynamic imports relative to the base HREF.
          // However since we're the one calling the import keyword, they would be resolved relative to
          // this framework bundle URL. Fix this by providing an absolute URL.
          if (typeof url === "string" && url.startsWith("./")) {
              url = new URL(url.substr(2), document.baseURI).toString();
          }
          return import(/* webpackIgnore: true */ url);
      });
      let nextJsObjectId = 1; // Start at 1 because zero is reserved for "window"
      /**
       * Creates a .NET call dispatcher to use for handling invocations between JavaScript and a .NET runtime.
       *
       * @param dotNetCallDispatcher An object that can dispatch calls from JavaScript to a .NET runtime.
       */
      function attachDispatcher(dotNetCallDispatcher) {
          const result = new CallDispatcher(dotNetCallDispatcher);
          if (defaultCallDispatcher === undefined) {
              // This was the first dispatcher registered, so it becomes the default. This exists purely for
              // backwards compatibility.
              defaultCallDispatcher = result;
          }
          else if (defaultCallDispatcher) {
              // There is already a default dispatcher. Now that there are multiple to choose from, there can
              // be no acceptable default, so we nullify the default dispatcher.
              defaultCallDispatcher = null;
          }
          return result;
      }
      DotNet.attachDispatcher = attachDispatcher;
      /**
       * Adds a JSON reviver callback that will be used when parsing arguments received from .NET.
       * @param reviver The reviver to add.
       */
      function attachReviver(reviver) {
          jsonRevivers.push(reviver);
      }
      DotNet.attachReviver = attachReviver;
      /**
       * Invokes the specified .NET public method synchronously. Not all hosting scenarios support
       * synchronous invocation, so if possible use invokeMethodAsync instead.
       *
       * @deprecated Use DotNetObject to invoke instance methods instead.
       * @param assemblyName The short name (without key/version or .dll extension) of the .NET assembly containing the method.
       * @param methodIdentifier The identifier of the method to invoke. The method must have a [JSInvokable] attribute specifying this identifier.
       * @param args Arguments to pass to the method, each of which must be JSON-serializable.
       * @returns The result of the operation.
       */
      function invokeMethod(assemblyName, methodIdentifier, ...args) {
          const dispatcher = getDefaultCallDispatcher();
          return dispatcher.invokeDotNetStaticMethod(assemblyName, methodIdentifier, ...args);
      }
      DotNet.invokeMethod = invokeMethod;
      /**
       * Invokes the specified .NET public method asynchronously.
       *
       * @deprecated Use DotNetObject to invoke instance methods instead.
       * @param assemblyName The short name (without key/version or .dll extension) of the .NET assembly containing the method.
       * @param methodIdentifier The identifier of the method to invoke. The method must have a [JSInvokable] attribute specifying this identifier.
       * @param args Arguments to pass to the method, each of which must be JSON-serializable.
       * @returns A promise representing the result of the operation.
       */
      function invokeMethodAsync(assemblyName, methodIdentifier, ...args) {
          const dispatcher = getDefaultCallDispatcher();
          return dispatcher.invokeDotNetStaticMethodAsync(assemblyName, methodIdentifier, ...args);
      }
      DotNet.invokeMethodAsync = invokeMethodAsync;
      /**
       * Creates a JavaScript object reference that can be passed to .NET via interop calls.
       *
       * @param jsObject The JavaScript Object used to create the JavaScript object reference.
       * @returns The JavaScript object reference (this will be the same instance as the given object).
       * @throws Error if the given value is not an Object.
       */
      function createJSObjectReference(jsObject) {
          if (jsObject && typeof jsObject === "object") {
              cachedJSObjectsById[nextJsObjectId] = new JSObject(jsObject);
              const result = {
                  [jsObjectIdKey]: nextJsObjectId
              };
              nextJsObjectId++;
              return result;
          }
          throw new Error(`Cannot create a JSObjectReference from the value '${jsObject}'.`);
      }
      DotNet.createJSObjectReference = createJSObjectReference;
      /**
       * Creates a JavaScript data reference that can be passed to .NET via interop calls.
       *
       * @param streamReference The ArrayBufferView or Blob used to create the JavaScript stream reference.
       * @returns The JavaScript data reference (this will be the same instance as the given object).
       * @throws Error if the given value is not an Object or doesn't have a valid byteLength.
       */
      function createJSStreamReference(streamReference) {
          let length = -1;
          // If we're given a raw Array Buffer, we interpret it as a `Uint8Array` as
          // ArrayBuffers' aren't directly readable.
          if (streamReference instanceof ArrayBuffer) {
              streamReference = new Uint8Array(streamReference);
          }
          if (streamReference instanceof Blob) {
              length = streamReference.size;
          }
          else if (streamReference.buffer instanceof ArrayBuffer) {
              if (streamReference.byteLength === undefined) {
                  throw new Error(`Cannot create a JSStreamReference from the value '${streamReference}' as it doesn't have a byteLength.`);
              }
              length = streamReference.byteLength;
          }
          else {
              throw new Error("Supplied value is not a typed array or blob.");
          }
          const result = {
              [jsStreamReferenceLengthKey]: length
          };
          try {
              const jsObjectReference = createJSObjectReference(streamReference);
              result[jsObjectIdKey] = jsObjectReference[jsObjectIdKey];
          }
          catch (error) {
              throw new Error(`Cannot create a JSStreamReference from the value '${streamReference}'.`);
          }
          return result;
      }
      DotNet.createJSStreamReference = createJSStreamReference;
      /**
       * Disposes the given JavaScript object reference.
       *
       * @param jsObjectReference The JavaScript Object reference.
       */
      function disposeJSObjectReference(jsObjectReference) {
          const id = jsObjectReference && jsObjectReference[jsObjectIdKey];
          if (typeof id === "number") {
              disposeJSObjectReferenceById(id);
          }
      }
      DotNet.disposeJSObjectReference = disposeJSObjectReference;
      function parseJsonWithRevivers(callDispatcher, json) {
          currentCallDispatcher = callDispatcher;
          const result = json ? JSON.parse(json, (key, initialValue) => {
              // Invoke each reviver in order, passing the output from the previous reviver,
              // so that each one gets a chance to transform the value
              return jsonRevivers.reduce((latestValue, reviver) => reviver(key, latestValue), initialValue);
          }) : null;
          currentCallDispatcher = undefined;
          return result;
      }
      function getDefaultCallDispatcher() {
          if (defaultCallDispatcher === undefined) {
              throw new Error("No call dispatcher has been set.");
          }
          else if (defaultCallDispatcher === null) {
              throw new Error("There are multiple .NET runtimes present, so a default dispatcher could not be resolved. Use DotNetObject to invoke .NET instance methods.");
          }
          else {
              return defaultCallDispatcher;
          }
      }
      /**
       * Represents the type of result expected from a JS interop call.
       */
      // eslint-disable-next-line no-shadow
      let JSCallResultType;
      (function (JSCallResultType) {
          JSCallResultType[JSCallResultType["Default"] = 0] = "Default";
          JSCallResultType[JSCallResultType["JSObjectReference"] = 1] = "JSObjectReference";
          JSCallResultType[JSCallResultType["JSStreamReference"] = 2] = "JSStreamReference";
          JSCallResultType[JSCallResultType["JSVoidResult"] = 3] = "JSVoidResult";
      })(JSCallResultType = DotNet.JSCallResultType || (DotNet.JSCallResultType = {}));
      class CallDispatcher {
          // eslint-disable-next-line no-empty-function
          constructor(_dotNetCallDispatcher) {
              this._dotNetCallDispatcher = _dotNetCallDispatcher;
              this._byteArraysToBeRevived = new Map();
              this._pendingDotNetToJSStreams = new Map();
              this._pendingAsyncCalls = {};
              this._nextAsyncCallId = 1; // Start at 1 because zero signals "no response needed"
          }
          getDotNetCallDispatcher() {
              return this._dotNetCallDispatcher;
          }
          invokeJSFromDotNet(identifier, argsJson, resultType, targetInstanceId) {
              const args = parseJsonWithRevivers(this, argsJson);
              const jsFunction = findJSFunction(identifier, targetInstanceId);
              const returnValue = jsFunction(...(args || []));
              const result = createJSCallResult(returnValue, resultType);
              return result === null || result === undefined
                  ? null
                  : stringifyArgs(this, result);
          }
          beginInvokeJSFromDotNet(asyncHandle, identifier, argsJson, resultType, targetInstanceId) {
              // Coerce synchronous functions into async ones, plus treat
              // synchronous exceptions the same as async ones
              const promise = new Promise(resolve => {
                  const args = parseJsonWithRevivers(this, argsJson);
                  const jsFunction = findJSFunction(identifier, targetInstanceId);
                  const synchronousResultOrPromise = jsFunction(...(args || []));
                  resolve(synchronousResultOrPromise);
              });
              // We only listen for a result if the caller wants to be notified about it
              if (asyncHandle) {
                  // On completion, dispatch result back to .NET
                  // Not using "await" because it codegens a lot of boilerplate
                  promise.
                      then(result => stringifyArgs(this, [
                      asyncHandle,
                      true,
                      createJSCallResult(result, resultType)
                  ])).
                      then(result => this._dotNetCallDispatcher.endInvokeJSFromDotNet(asyncHandle, true, result), error => this._dotNetCallDispatcher.endInvokeJSFromDotNet(asyncHandle, false, JSON.stringify([
                      asyncHandle,
                      false,
                      formatError(error)
                  ])));
              }
          }
          endInvokeDotNetFromJS(asyncCallId, success, resultJsonOrExceptionMessage) {
              const resultOrError = success
                  ? parseJsonWithRevivers(this, resultJsonOrExceptionMessage)
                  : new Error(resultJsonOrExceptionMessage);
              this.completePendingCall(parseInt(asyncCallId, 10), success, resultOrError);
          }
          invokeDotNetStaticMethod(assemblyName, methodIdentifier, ...args) {
              return this.invokeDotNetMethod(assemblyName, methodIdentifier, null, args);
          }
          invokeDotNetStaticMethodAsync(assemblyName, methodIdentifier, ...args) {
              return this.invokeDotNetMethodAsync(assemblyName, methodIdentifier, null, args);
          }
          invokeDotNetMethod(assemblyName, methodIdentifier, dotNetObjectId, args) {
              if (this._dotNetCallDispatcher.invokeDotNetFromJS) {
                  const argsJson = stringifyArgs(this, args);
                  const resultJson = this._dotNetCallDispatcher.invokeDotNetFromJS(assemblyName, methodIdentifier, dotNetObjectId, argsJson);
                  return resultJson ? parseJsonWithRevivers(this, resultJson) : null;
              }
              throw new Error("The current dispatcher does not support synchronous calls from JS to .NET. Use invokeDotNetMethodAsync instead.");
          }
          invokeDotNetMethodAsync(assemblyName, methodIdentifier, dotNetObjectId, args) {
              if (assemblyName && dotNetObjectId) {
                  throw new Error(`For instance method calls, assemblyName should be null. Received '${assemblyName}'.`);
              }
              const asyncCallId = this._nextAsyncCallId++;
              const resultPromise = new Promise((resolve, reject) => {
                  this._pendingAsyncCalls[asyncCallId] = { resolve, reject };
              });
              try {
                  const argsJson = stringifyArgs(this, args);
                  this._dotNetCallDispatcher.beginInvokeDotNetFromJS(asyncCallId, assemblyName, methodIdentifier, dotNetObjectId, argsJson);
              }
              catch (ex) {
                  // Synchronous failure
                  this.completePendingCall(asyncCallId, false, ex);
              }
              return resultPromise;
          }
          receiveByteArray(id, data) {
              this._byteArraysToBeRevived.set(id, data);
          }
          processByteArray(id) {
              const result = this._byteArraysToBeRevived.get(id);
              if (!result) {
                  return null;
              }
              this._byteArraysToBeRevived.delete(id);
              return result;
          }
          supplyDotNetStream(streamId, stream) {
              if (this._pendingDotNetToJSStreams.has(streamId)) {
                  // The receiver is already waiting, so we can resolve the promise now and stop tracking this
                  const pendingStream = this._pendingDotNetToJSStreams.get(streamId);
                  this._pendingDotNetToJSStreams.delete(streamId);
                  pendingStream.resolve(stream);
              }
              else {
                  // The receiver hasn't started waiting yet, so track a pre-completed entry it can attach to later
                  const pendingStream = new PendingStream();
                  pendingStream.resolve(stream);
                  this._pendingDotNetToJSStreams.set(streamId, pendingStream);
              }
          }
          getDotNetStreamPromise(streamId) {
              // We might already have started receiving the stream, or maybe it will come later.
              // We have to handle both possible orderings, but we can count on it coming eventually because
              // it's not something the developer gets to control, and it would be an error if it doesn't.
              let result;
              if (this._pendingDotNetToJSStreams.has(streamId)) {
                  // We've already started receiving the stream, so no longer need to track it as pending
                  result = this._pendingDotNetToJSStreams.get(streamId).streamPromise;
                  this._pendingDotNetToJSStreams.delete(streamId);
              }
              else {
                  // We haven't started receiving it yet, so add an entry to track it as pending
                  const pendingStream = new PendingStream();
                  this._pendingDotNetToJSStreams.set(streamId, pendingStream);
                  result = pendingStream.streamPromise;
              }
              return result;
          }
          completePendingCall(asyncCallId, success, resultOrError) {
              if (!this._pendingAsyncCalls.hasOwnProperty(asyncCallId)) {
                  throw new Error(`There is no pending async call with ID ${asyncCallId}.`);
              }
              const asyncCall = this._pendingAsyncCalls[asyncCallId];
              delete this._pendingAsyncCalls[asyncCallId];
              if (success) {
                  asyncCall.resolve(resultOrError);
              }
              else {
                  asyncCall.reject(resultOrError);
              }
          }
      }
      function formatError(error) {
          if (error instanceof Error) {
              return `${error.message}\n${error.stack}`;
          }
          return error ? error.toString() : "null";
      }
      function findJSFunction(identifier, targetInstanceId) {
          const targetInstance = cachedJSObjectsById[targetInstanceId];
          if (targetInstance) {
              return targetInstance.findFunction(identifier);
          }
          throw new Error(`JS object instance with ID ${targetInstanceId} does not exist (has it been disposed?).`);
      }
      DotNet.findJSFunction = findJSFunction;
      function disposeJSObjectReferenceById(id) {
          delete cachedJSObjectsById[id];
      }
      DotNet.disposeJSObjectReferenceById = disposeJSObjectReferenceById;
      class DotNetObject {
          // eslint-disable-next-line no-empty-function
          constructor(_id, _callDispatcher) {
              this._id = _id;
              this._callDispatcher = _callDispatcher;
          }
          invokeMethod(methodIdentifier, ...args) {
              return this._callDispatcher.invokeDotNetMethod(null, methodIdentifier, this._id, args);
          }
          invokeMethodAsync(methodIdentifier, ...args) {
              return this._callDispatcher.invokeDotNetMethodAsync(null, methodIdentifier, this._id, args);
          }
          dispose() {
              const promise = this._callDispatcher.invokeDotNetMethodAsync(null, "__Dispose", this._id, null);
              promise.catch(error => console.error(error));
          }
          serializeAsArg() {
              return { [dotNetObjectRefKey]: this._id };
          }
      }
      DotNet.DotNetObject = DotNetObject;
      attachReviver(function reviveReference(key, value) {
          if (value && typeof value === "object") {
              if (value.hasOwnProperty(dotNetObjectRefKey)) {
                  return new DotNetObject(value[dotNetObjectRefKey], currentCallDispatcher);
              }
              else if (value.hasOwnProperty(jsObjectIdKey)) {
                  const id = value[jsObjectIdKey];
                  const jsObject = cachedJSObjectsById[id];
                  if (jsObject) {
                      return jsObject.getWrappedObject();
                  }
                  throw new Error(`JS object instance with Id '${id}' does not exist. It may have been disposed.`);
              }
              else if (value.hasOwnProperty(byteArrayRefKey)) {
                  const index = value[byteArrayRefKey];
                  const byteArray = currentCallDispatcher.processByteArray(index);
                  if (byteArray === undefined) {
                      throw new Error(`Byte array index '${index}' does not exist.`);
                  }
                  return byteArray;
              }
              else if (value.hasOwnProperty(dotNetStreamRefKey)) {
                  const streamId = value[dotNetStreamRefKey];
                  const streamPromise = currentCallDispatcher.getDotNetStreamPromise(streamId);
                  return new DotNetStream(streamPromise);
              }
          }
          // Unrecognized - let another reviver handle it
          return value;
      });
      class DotNetStream {
          // eslint-disable-next-line no-empty-function
          constructor(_streamPromise) {
              this._streamPromise = _streamPromise;
          }
          /**
           * Supplies a readable stream of data being sent from .NET.
           */
          stream() {
              return this._streamPromise;
          }
          /**
           * Supplies a array buffer of data being sent from .NET.
           * Note there is a JavaScript limit on the size of the ArrayBuffer equal to approximately 2GB.
           */
          async arrayBuffer() {
              return new Response(await this.stream()).arrayBuffer();
          }
      }
      class PendingStream {
          constructor() {
              this.streamPromise = new Promise((resolve, reject) => {
                  this.resolve = resolve;
                  this.reject = reject;
              });
          }
      }
      function createJSCallResult(returnValue, resultType) {
          switch (resultType) {
              case JSCallResultType.Default:
                  return returnValue;
              case JSCallResultType.JSObjectReference:
                  return createJSObjectReference(returnValue);
              case JSCallResultType.JSStreamReference:
                  return createJSStreamReference(returnValue);
              case JSCallResultType.JSVoidResult:
                  return null;
              default:
                  throw new Error(`Invalid JS call result type '${resultType}'.`);
          }
      }
      let nextByteArrayIndex = 0;
      function stringifyArgs(callDispatcher, args) {
          nextByteArrayIndex = 0;
          currentCallDispatcher = callDispatcher;
          const result = JSON.stringify(args, argReplacer);
          currentCallDispatcher = undefined;
          return result;
      }
      function argReplacer(key, value) {
          if (value instanceof DotNetObject) {
              return value.serializeAsArg();
          }
          else if (value instanceof Uint8Array) {
              const dotNetCallDispatcher = currentCallDispatcher.getDotNetCallDispatcher();
              dotNetCallDispatcher.sendByteArray(nextByteArrayIndex, value);
              const jsonValue = { [byteArrayRefKey]: nextByteArrayIndex };
              nextByteArrayIndex++;
              return jsonValue;
          }
          return value;
      }
  })(DotNet || (DotNet = {}));

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const pendingRootComponentContainerNamePrefix = '__bl-dynamic-root:';
  const pendingRootComponentContainers = new Map();
  let nextPendingDynamicRootComponentIdentifier = 0;
  let manager;
  let jsComponentParametersByIdentifier;
  // These are the public APIs at Blazor.rootComponents.*
  const RootComponentsFunctions = {
      async add(toElement, componentIdentifier, initialParameters) {
          if (!initialParameters) {
              throw new Error('initialParameters must be an object, even if empty.');
          }
          // Track the container so we can use it when the component gets attached to the document via a selector
          const containerIdentifier = pendingRootComponentContainerNamePrefix + (++nextPendingDynamicRootComponentIdentifier).toString();
          pendingRootComponentContainers.set(containerIdentifier, toElement);
          // Instruct .NET to add and render the new root component
          const componentId = await getRequiredManager().invokeMethodAsync('AddRootComponent', componentIdentifier, containerIdentifier);
          const component = new DynamicRootComponent(componentId, jsComponentParametersByIdentifier[componentIdentifier]);
          await component.setParameters(initialParameters);
          return component;
      },
  };
  class EventCallbackWrapper {
      invoke(arg) {
          return this._callback(arg);
      }
      setCallback(callback) {
          if (!this._selfJSObjectReference) {
              this._selfJSObjectReference = DotNet.createJSObjectReference(this);
          }
          this._callback = callback;
      }
      getJSObjectReference() {
          return this._selfJSObjectReference;
      }
      dispose() {
          if (this._selfJSObjectReference) {
              DotNet.disposeJSObjectReference(this._selfJSObjectReference);
          }
      }
  }
  class DynamicRootComponent {
      constructor(componentId, parameters) {
          this._jsEventCallbackWrappers = new Map();
          this._componentId = componentId;
          for (const parameter of parameters) {
              if (parameter.type === 'eventcallback') {
                  this._jsEventCallbackWrappers.set(parameter.name.toLowerCase(), new EventCallbackWrapper());
              }
          }
      }
      setParameters(parameters) {
          const mappedParameters = {};
          const entries = Object.entries(parameters || {});
          const parameterCount = entries.length;
          for (const [key, value] of entries) {
              const callbackWrapper = this._jsEventCallbackWrappers.get(key.toLowerCase());
              if (!callbackWrapper || !value) {
                  mappedParameters[key] = value;
                  continue;
              }
              callbackWrapper.setCallback(value);
              mappedParameters[key] = callbackWrapper.getJSObjectReference();
          }
          return getRequiredManager().invokeMethodAsync('SetRootComponentParameters', this._componentId, parameterCount, mappedParameters);
      }
      async dispose() {
          if (this._componentId !== null) {
              await getRequiredManager().invokeMethodAsync('RemoveRootComponent', this._componentId);
              this._componentId = null; // Ensure it can't be used again
              for (const jsEventCallbackWrapper of this._jsEventCallbackWrappers.values()) {
                  jsEventCallbackWrapper.dispose();
              }
          }
      }
  }
  // Called by the framework
  function enableJSRootComponents(managerInstance, jsComponentParameters, jsComponentInitializers) {
      if (manager) {
          // This will only happen in very nonstandard cases where someone has multiple hosts.
          // It's up to the developer to ensure that only one of them enables dynamic root components.
          throw new Error('Dynamic root components have already been enabled.');
      }
      manager = managerInstance;
      jsComponentParametersByIdentifier = jsComponentParameters;
      // Call the registered initializers. This is an arbitrary subset of the JS component types that are registered
      // on the .NET side - just those of them that require some JS-side initialization (e.g., to register them
      // as custom elements).
      for (const [initializerIdentifier, componentIdentifiers] of Object.entries(jsComponentInitializers)) {
          const initializerFunc = DotNet.findJSFunction(initializerIdentifier, 0);
          for (const componentIdentifier of componentIdentifiers) {
              const parameters = jsComponentParameters[componentIdentifier];
              initializerFunc(componentIdentifier, parameters);
          }
      }
  }
  function getRequiredManager() {
      if (!manager) {
          throw new Error('Dynamic root components have not been enabled in this application.');
      }
      return manager;
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const interopMethodsByRenderer = new Map();
  const rendererAttachedListeners = [];
  const rendererByIdResolverMap = new Map();
  function attachWebRendererInterop(rendererId, interopMethods, jsComponentParameters, jsComponentInitializers) {
      if (interopMethodsByRenderer.has(rendererId)) {
          throw new Error(`Interop methods are already registered for renderer ${rendererId}`);
      }
      interopMethodsByRenderer.set(rendererId, interopMethods);
      if (jsComponentParameters && jsComponentInitializers && Object.keys(jsComponentParameters).length > 0) {
          const manager = getInteropMethods(rendererId);
          enableJSRootComponents(manager, jsComponentParameters, jsComponentInitializers);
      }
      rendererByIdResolverMap.get(rendererId)?.[0]?.();
      invokeRendererAttachedListeners(rendererId);
  }
  function isRendererAttached(browserRendererId) {
      return interopMethodsByRenderer.has(browserRendererId);
  }
  function invokeRendererAttachedListeners(browserRendererId) {
      for (const listener of rendererAttachedListeners) {
          listener(browserRendererId);
      }
  }
  function dispatchEvent(browserRendererId, eventDescriptor, eventArgs) {
      return dispatchEventMiddleware(browserRendererId, eventDescriptor.eventHandlerId, () => {
          const interopMethods = getInteropMethods(browserRendererId);
          return interopMethods.invokeMethodAsync('DispatchEventAsync', eventDescriptor, eventArgs);
      });
  }
  function getInteropMethods(rendererId) {
      const interopMethods = interopMethodsByRenderer.get(rendererId);
      if (!interopMethods) {
          throw new Error(`No interop methods are registered for renderer ${rendererId}`);
      }
      return interopMethods;
  }
  let dispatchEventMiddleware = (browserRendererId, eventHandlerId, continuation) => continuation();

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const nonBubblingEvents = toLookup([
      'abort',
      'blur',
      'cancel',
      'canplay',
      'canplaythrough',
      'change',
      'close',
      'cuechange',
      'durationchange',
      'emptied',
      'ended',
      'error',
      'focus',
      'load',
      'loadeddata',
      'loadedmetadata',
      'loadend',
      'loadstart',
      'mouseenter',
      'mouseleave',
      'pointerenter',
      'pointerleave',
      'pause',
      'play',
      'playing',
      'progress',
      'ratechange',
      'reset',
      'scroll',
      'seeked',
      'seeking',
      'stalled',
      'submit',
      'suspend',
      'timeupdate',
      'toggle',
      'unload',
      'volumechange',
      'waiting',
      'DOMNodeInsertedIntoDocument',
      'DOMNodeRemovedFromDocument',
  ]);
  const alwaysPreventDefaultEvents = { submit: true };
  const disableableEventNames = toLookup([
      'click',
      'dblclick',
      'mousedown',
      'mousemove',
      'mouseup',
  ]);
  // Responsible for adding/removing the eventInfo on an expando property on DOM elements, and
  // calling an EventInfoStore that deals with registering/unregistering the underlying delegated
  // event listeners as required (and also maps actual events back to the given callback).
  class EventDelegator {
      static { this.nextEventDelegatorId = 0; }
      constructor(browserRendererId) {
          this.browserRendererId = browserRendererId;
          this.afterClickCallbacks = [];
          const eventDelegatorId = ++EventDelegator.nextEventDelegatorId;
          this.eventsCollectionKey = `_blazorEvents_${eventDelegatorId}`;
          this.eventInfoStore = new EventInfoStore(this.onGlobalEvent.bind(this));
      }
      setListener(element, eventName, eventHandlerId, renderingComponentId) {
          const infoForElement = this.getEventHandlerInfosForElement(element, true);
          const existingHandler = infoForElement.getHandler(eventName);
          if (existingHandler) {
              // We can cheaply update the info on the existing object and don't need any other housekeeping
              // Note that this also takes care of updating the eventHandlerId on the existing handler object
              this.eventInfoStore.update(existingHandler.eventHandlerId, eventHandlerId);
          }
          else {
              // Go through the whole flow which might involve registering a new global handler
              const newInfo = { element, eventName, eventHandlerId, renderingComponentId };
              this.eventInfoStore.add(newInfo);
              infoForElement.setHandler(eventName, newInfo);
          }
      }
      getHandler(eventHandlerId) {
          return this.eventInfoStore.get(eventHandlerId);
      }
      removeListener(eventHandlerId) {
          // This method gets called whenever the .NET-side code reports that a certain event handler
          // has been disposed. However we will already have disposed the info about that handler if
          // the eventHandlerId for the (element,eventName) pair was replaced during diff application.
          const info = this.eventInfoStore.remove(eventHandlerId);
          if (info) {
              // Looks like this event handler wasn't already disposed
              // Remove the associated data from the DOM element
              const element = info.element;
              const elementEventInfos = this.getEventHandlerInfosForElement(element, false);
              if (elementEventInfos) {
                  elementEventInfos.removeHandler(info.eventName);
              }
          }
      }
      notifyAfterClick(callback) {
          // This is extremely special-case. It's needed so that navigation link click interception
          // can be sure to run *after* our synthetic bubbling process. If a need arises, we can
          // generalise this, but right now it's a purely internal detail.
          this.afterClickCallbacks.push(callback);
          this.eventInfoStore.addGlobalListener('click'); // Ensure we always listen for this
      }
      setStopPropagation(element, eventName, value) {
          const infoForElement = this.getEventHandlerInfosForElement(element, true);
          infoForElement.stopPropagation(eventName, value);
      }
      setPreventDefault(element, eventName, value) {
          const infoForElement = this.getEventHandlerInfosForElement(element, true);
          infoForElement.preventDefault(eventName, value);
      }
      onGlobalEvent(evt) {
          if (!(evt.target instanceof Element)) {
              return;
          }
          // Always dispatch to any listeners for the original underlying browser event name
          this.dispatchGlobalEventToAllElements(evt.type, evt);
          // If this event name has aliases, dispatch for those listeners too
          const eventNameAliases = getEventNameAliases(evt.type);
          eventNameAliases && eventNameAliases.forEach(alias => this.dispatchGlobalEventToAllElements(alias, evt));
          // Special case for navigation interception
          if (evt.type === 'click') {
              this.afterClickCallbacks.forEach(callback => callback(evt));
          }
      }
      dispatchGlobalEventToAllElements(eventName, browserEvent) {
          // Note that 'eventName' can be an alias. For example, eventName may be 'click.special'
          // while browserEvent.type may be 'click'.
          // Use the event's 'path' rather than the chain of parent nodes, since the path gives
          // visibility into shadow roots.
          const path = browserEvent.composedPath();
          // Scan up the element hierarchy, looking for any matching registered event handlers
          let candidateEventTarget = path.shift();
          let eventArgs = null; // Populate lazily
          let eventArgsIsPopulated = false;
          const eventIsNonBubbling = Object.prototype.hasOwnProperty.call(nonBubblingEvents, eventName);
          let stopPropagationWasRequested = false;
          while (candidateEventTarget) {
              const candidateElement = candidateEventTarget;
              const handlerInfos = this.getEventHandlerInfosForElement(candidateElement, false);
              if (handlerInfos) {
                  const handlerInfo = handlerInfos.getHandler(eventName);
                  if (handlerInfo && !eventIsDisabledOnElement(candidateElement, browserEvent.type)) {
                      // We are going to raise an event for this element, so prepare info needed by the .NET code
                      if (!eventArgsIsPopulated) {
                          const eventOptionsIfRegistered = getEventTypeOptions(eventName);
                          // For back-compat, if there's no registered createEventArgs, we supply empty event args (not null).
                          // But if there is a registered createEventArgs, it can supply anything (including null).
                          eventArgs = eventOptionsIfRegistered?.createEventArgs
                              ? eventOptionsIfRegistered.createEventArgs(browserEvent)
                              : {};
                          eventArgsIsPopulated = true;
                      }
                      // For certain built-in events, having any .NET handler implicitly means we will prevent
                      // the browser's default behavior. This has to be based on the original browser event type name,
                      // not any alias (e.g., if you create a custom 'submit' variant, it should still preventDefault).
                      if (Object.prototype.hasOwnProperty.call(alwaysPreventDefaultEvents, browserEvent.type)) {
                          browserEvent.preventDefault();
                      }
                      dispatchEvent(this.browserRendererId, {
                          eventHandlerId: handlerInfo.eventHandlerId,
                          eventName: eventName,
                          eventFieldInfo: EventFieldInfo.fromEvent(handlerInfo.renderingComponentId, browserEvent),
                      }, eventArgs);
                  }
                  if (handlerInfos.stopPropagation(eventName)) {
                      stopPropagationWasRequested = true;
                  }
                  if (handlerInfos.preventDefault(eventName)) {
                      browserEvent.preventDefault();
                  }
              }
              candidateEventTarget = (eventIsNonBubbling || stopPropagationWasRequested) ? undefined : path.shift();
          }
      }
      getEventHandlerInfosForElement(element, createIfNeeded) {
          if (Object.prototype.hasOwnProperty.call(element, this.eventsCollectionKey)) {
              return element[this.eventsCollectionKey];
          }
          else if (createIfNeeded) {
              return (element[this.eventsCollectionKey] = new EventHandlerInfosForElement());
          }
          else {
              return null;
          }
      }
  }
  // Responsible for adding and removing the global listener when the number of listeners
  // for a given event name changes between zero and nonzero
  class EventInfoStore {
      constructor(globalListener) {
          this.globalListener = globalListener;
          this.infosByEventHandlerId = {};
          this.countByEventName = {};
          eventNameAliasRegisteredCallbacks.push(this.handleEventNameAliasAdded.bind(this));
      }
      add(info) {
          if (this.infosByEventHandlerId[info.eventHandlerId]) {
              // Should never happen, but we want to know if it does
              throw new Error(`Event ${info.eventHandlerId} is already tracked`);
          }
          this.infosByEventHandlerId[info.eventHandlerId] = info;
          this.addGlobalListener(info.eventName);
      }
      get(eventHandlerId) {
          return this.infosByEventHandlerId[eventHandlerId];
      }
      addGlobalListener(eventName) {
          // If this event name is an alias, update the global listener for the corresponding browser event
          eventName = getBrowserEventName(eventName);
          if (Object.prototype.hasOwnProperty.call(this.countByEventName, eventName)) {
              this.countByEventName[eventName]++;
          }
          else {
              this.countByEventName[eventName] = 1;
              // To make delegation work with non-bubbling events, register a 'capture' listener.
              // We preserve the non-bubbling behavior by only dispatching such events to the targeted element.
              const useCapture = Object.prototype.hasOwnProperty.call(nonBubblingEvents, eventName);
              document.addEventListener(eventName, this.globalListener, useCapture);
          }
      }
      update(oldEventHandlerId, newEventHandlerId) {
          if (Object.prototype.hasOwnProperty.call(this.infosByEventHandlerId, newEventHandlerId)) {
              // Should never happen, but we want to know if it does
              throw new Error(`Event ${newEventHandlerId} is already tracked`);
          }
          // Since we're just updating the event handler ID, there's no need to update the global counts
          const info = this.infosByEventHandlerId[oldEventHandlerId];
          delete this.infosByEventHandlerId[oldEventHandlerId];
          info.eventHandlerId = newEventHandlerId;
          this.infosByEventHandlerId[newEventHandlerId] = info;
      }
      remove(eventHandlerId) {
          const info = this.infosByEventHandlerId[eventHandlerId];
          if (info) {
              delete this.infosByEventHandlerId[eventHandlerId];
              // If this event name is an alias, update the global listener for the corresponding browser event
              const eventName = getBrowserEventName(info.eventName);
              if (--this.countByEventName[eventName] === 0) {
                  delete this.countByEventName[eventName];
                  document.removeEventListener(eventName, this.globalListener);
              }
          }
          return info;
      }
      handleEventNameAliasAdded(aliasEventName, browserEventName) {
          // If an event name alias gets registered later, we need to update the global listener
          // registrations to match. This makes it equivalent to the alias having been registered
          // before the elements with event handlers got rendered.
          if (Object.prototype.hasOwnProperty.call(this.countByEventName, aliasEventName)) {
              // Delete old
              const countByAliasEventName = this.countByEventName[aliasEventName];
              delete this.countByEventName[aliasEventName];
              document.removeEventListener(aliasEventName, this.globalListener);
              // Ensure corresponding count is added to new
              this.addGlobalListener(browserEventName);
              this.countByEventName[browserEventName] += countByAliasEventName - 1;
          }
      }
  }
  class EventHandlerInfosForElement {
      constructor() {
          // Although we *could* track multiple event handlers per (element, eventName) pair
          // (since they have distinct eventHandlerId values), there's no point doing so because
          // our programming model is that you declare event handlers as attributes. An element
          // can only have one attribute with a given name, hence only one event handler with
          // that name at any one time.
          // So to keep things simple, only track one EventHandlerInfo per (element, eventName)
          this.handlers = {};
          this.preventDefaultFlags = null;
          this.stopPropagationFlags = null;
      }
      getHandler(eventName) {
          return Object.prototype.hasOwnProperty.call(this.handlers, eventName) ? this.handlers[eventName] : null;
      }
      setHandler(eventName, handler) {
          this.handlers[eventName] = handler;
      }
      removeHandler(eventName) {
          delete this.handlers[eventName];
      }
      preventDefault(eventName, setValue) {
          if (setValue !== undefined) {
              this.preventDefaultFlags = this.preventDefaultFlags || {};
              this.preventDefaultFlags[eventName] = setValue;
          }
          return this.preventDefaultFlags ? this.preventDefaultFlags[eventName] : false;
      }
      stopPropagation(eventName, setValue) {
          if (setValue !== undefined) {
              this.stopPropagationFlags = this.stopPropagationFlags || {};
              this.stopPropagationFlags[eventName] = setValue;
          }
          return this.stopPropagationFlags ? this.stopPropagationFlags[eventName] : false;
      }
  }
  function toLookup(items) {
      const result = {};
      items.forEach(value => {
          result[value] = true;
      });
      return result;
  }
  function eventIsDisabledOnElement(element, rawBrowserEventName) {
      // We want to replicate the normal DOM event behavior that, for 'interactive' elements
      // with a 'disabled' attribute, certain mouse events are suppressed
      return (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
          && Object.prototype.hasOwnProperty.call(disableableEventNames, rawBrowserEventName)
          && element.disabled;
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  /*
    A LogicalElement plays the same role as an Element instance from the point of view of the
    API consumer. Inserting and removing logical elements updates the browser DOM just the same.

    The difference is that, unlike regular DOM mutation APIs, the LogicalElement APIs don't use
    the underlying DOM structure as the data storage for the element hierarchy. Instead, the
    LogicalElement APIs take care of tracking hierarchical relationships separately. The point
    of this is to permit a logical tree structure in which parent/child relationships don't
    have to be materialized in terms of DOM element parent/child relationships. And the reason
    why we want that is so that hierarchies of Razor components can be tracked even when those
    components' render output need not be a single literal DOM element.

    Consumers of the API don't need to know about the implementation, but how it's done is:
    - Each LogicalElement is materialized in the DOM as either:
      - A Node instance, for actual Node instances inserted using 'insertLogicalChild' or
        for Element instances promoted to LogicalElement via 'toLogicalElement'
      - A Comment instance, for 'logical container' instances inserted using 'createAndInsertLogicalContainer'
    - Then, on that instance (i.e., the Node or Comment), we store an array of 'logical children'
      instances, e.g.,
        [firstChild, secondChild, thirdChild, ...]
      ... plus we store a reference to the 'logical parent' (if any)
    - The 'logical children' array means we can look up in O(1):
      - The number of logical children (not currently implemented because not required, but trivial)
      - The logical child at any given index
    - Whenever a logical child is added or removed, we update the parent's array of logical children
  */
  const logicalChildrenPropname = Symbol();
  const logicalParentPropname = Symbol();
  function toLogicalElement(element, allowExistingContents) {
      if (logicalChildrenPropname in element) { // If it's already a logical element, leave it alone
          return element;
      }
      const childrenArray = [];
      if (element.childNodes.length > 0) {
          // Normally it's good to assert that the element has started empty, because that's the usual
          // situation and we probably have a bug if it's not. But for the elements that contain prerendered
          // root components, we want to let them keep their content until we replace it.
          if (!allowExistingContents) {
              throw new Error('New logical elements must start empty, or allowExistingContents must be true');
          }
          element.childNodes.forEach(child => {
              const childLogicalElement = toLogicalElement(child, /* allowExistingContents */ true);
              childLogicalElement[logicalParentPropname] = element;
              childrenArray.push(childLogicalElement);
          });
      }
      element[logicalChildrenPropname] = childrenArray;
      return element;
  }
  function emptyLogicalElement(element) {
      const childrenArray = getLogicalChildrenArray(element);
      while (childrenArray.length) {
          removeLogicalChild(element, 0);
      }
  }
  function createAndInsertLogicalContainer(parent, childIndex) {
      const containerElement = document.createComment('!');
      insertLogicalChild(containerElement, parent, childIndex);
      return containerElement;
  }
  function insertLogicalChild(child, parent, childIndex) {
      const childAsLogicalElement = child;
      // If the child is a component comment with logical children, its children
      // need to be inserted into the parent node
      let nodeToInsert = child;
      if (child instanceof Comment) {
          const existingGranchildren = getLogicalChildrenArray(childAsLogicalElement);
          if (existingGranchildren?.length > 0) {
              const lastNodeToInsert = findLastDomNodeInRange(childAsLogicalElement);
              const range = new Range();
              range.setStartBefore(child);
              range.setEndAfter(lastNodeToInsert);
              nodeToInsert = range.extractContents();
          }
      }
      // If the node we're inserting already has a logical parent,
      // remove it from its sibling array
      const existingLogicalParent = getLogicalParent(childAsLogicalElement);
      if (existingLogicalParent) {
          const existingSiblingArray = getLogicalChildrenArray(existingLogicalParent);
          const existingChildIndex = Array.prototype.indexOf.call(existingSiblingArray, childAsLogicalElement);
          existingSiblingArray.splice(existingChildIndex, 1);
          delete childAsLogicalElement[logicalParentPropname];
      }
      const newSiblings = getLogicalChildrenArray(parent);
      if (childIndex < newSiblings.length) {
          // Insert
          const nextSibling = newSiblings[childIndex];
          nextSibling.parentNode.insertBefore(nodeToInsert, nextSibling);
          newSiblings.splice(childIndex, 0, childAsLogicalElement);
      }
      else {
          // Append
          appendDomNode(nodeToInsert, parent);
          newSiblings.push(childAsLogicalElement);
      }
      childAsLogicalElement[logicalParentPropname] = parent;
      if (!(logicalChildrenPropname in childAsLogicalElement)) {
          childAsLogicalElement[logicalChildrenPropname] = [];
      }
  }
  function removeLogicalChild(parent, childIndex) {
      const childrenArray = getLogicalChildrenArray(parent);
      const childToRemove = childrenArray.splice(childIndex, 1)[0];
      // If it's a logical container, also remove its descendants
      if (childToRemove instanceof Comment) {
          const grandchildrenArray = getLogicalChildrenArray(childToRemove);
          if (grandchildrenArray) {
              while (grandchildrenArray.length > 0) {
                  removeLogicalChild(childToRemove, 0);
              }
          }
      }
      // Finally, remove the node itself
      const domNodeToRemove = childToRemove;
      domNodeToRemove.parentNode.removeChild(domNodeToRemove);
  }
  function getLogicalParent(element) {
      return element[logicalParentPropname] || null;
  }
  function getLogicalChild(parent, childIndex) {
      return getLogicalChildrenArray(parent)[childIndex];
  }
  // SVG elements support `foreignObject` children that can hold arbitrary HTML.
  // For these scenarios, the parent SVG and `foreignObject` elements should
  // be rendered under the SVG namespace, while the HTML content should be rendered
  // under the XHTML namespace. If the correct namespaces are not provided, most
  // browsers will fail to render the foreign object content. Here, we ensure that if
  // we encounter a `foreignObject` in the SVG, then all its children will be placed
  // under the XHTML namespace.
  function isSvgElement(element) {
      // Note: This check is intentionally case-sensitive since we expect this element
      // to appear as a child of an SVG element and SVGs are case-sensitive.
      const closestElement = getClosestDomElement(element);
      return closestElement.namespaceURI === 'http://www.w3.org/2000/svg' && closestElement['tagName'] !== 'foreignObject';
  }
  function getLogicalChildrenArray(element) {
      if (element == null)
          return [];
      return element[logicalChildrenPropname];
  }
  function getLogicalNextSibling(element) {
      const siblings = getLogicalChildrenArray(getLogicalParent(element));
      const siblingIndex = Array.prototype.indexOf.call(siblings, element);
      return siblings[siblingIndex + 1] || null;
  }
  function permuteLogicalChildren(parent, permutationList) {
      // The permutationList must represent a valid permutation, i.e., the list of 'from' indices
      // is distinct, and the list of 'to' indices is a permutation of it. The algorithm here
      // relies on that assumption.
      // Each of the phases here has to happen separately, because each one is designed not to
      // interfere with the indices or DOM entries used by subsequent phases.
      // Phase 1: track which nodes we will move
      const siblings = getLogicalChildrenArray(parent);
      permutationList.forEach((listEntry) => {
          listEntry.moveRangeStart = siblings[listEntry.fromSiblingIndex];
          listEntry.moveRangeEnd = findLastDomNodeInRange(listEntry.moveRangeStart);
      });
      // Phase 2: insert markers
      permutationList.forEach((listEntry) => {
          const marker = document.createComment('marker');
          listEntry.moveToBeforeMarker = marker;
          const insertBeforeNode = siblings[listEntry.toSiblingIndex + 1];
          if (insertBeforeNode) {
              insertBeforeNode.parentNode.insertBefore(marker, insertBeforeNode);
          }
          else {
              appendDomNode(marker, parent);
          }
      });
      // Phase 3: move descendants & remove markers
      permutationList.forEach((listEntry) => {
          const insertBefore = listEntry.moveToBeforeMarker;
          const parentDomNode = insertBefore.parentNode;
          const elementToMove = listEntry.moveRangeStart;
          const moveEndNode = listEntry.moveRangeEnd;
          let nextToMove = elementToMove;
          while (nextToMove) {
              const nextNext = nextToMove.nextSibling;
              parentDomNode.insertBefore(nextToMove, insertBefore);
              if (nextToMove === moveEndNode) {
                  break;
              }
              else {
                  nextToMove = nextNext;
              }
          }
          parentDomNode.removeChild(insertBefore);
      });
      // Phase 4: update siblings index
      permutationList.forEach((listEntry) => {
          siblings[listEntry.toSiblingIndex] = listEntry.moveRangeStart;
      });
  }
  function getClosestDomElement(logicalElement) {
      if (logicalElement instanceof Element || logicalElement instanceof DocumentFragment) {
          return logicalElement;
      }
      else if (logicalElement instanceof Comment) {
          return logicalElement.parentNode;
      }
      else {
          throw new Error('Not a valid logical element');
      }
  }
  function appendDomNode(child, parent) {
      // This function only puts 'child' into the DOM in the right place relative to 'parent'
      // It does not update the logical children array of anything
      if (parent instanceof Element || parent instanceof DocumentFragment) {
          parent.appendChild(child);
      }
      else if (parent instanceof Comment) {
          const parentLogicalNextSibling = getLogicalNextSibling(parent);
          if (parentLogicalNextSibling) {
              // Since the parent has a logical next-sibling, its appended child goes right before that
              parentLogicalNextSibling.parentNode.insertBefore(child, parentLogicalNextSibling);
          }
          else {
              // Since the parent has no logical next-sibling, keep recursing upwards until we find
              // a logical ancestor that does have a next-sibling or is a physical element.
              appendDomNode(child, getLogicalParent(parent));
          }
      }
      else {
          // Should never happen
          throw new Error(`Cannot append node because the parent is not a valid logical element. Parent: ${parent}`);
      }
  }
  // Returns the final node (in depth-first evaluation order) that is a descendant of the logical element.
  // As such, the entire subtree is between 'element' and 'findLastDomNodeInRange(element)' inclusive.
  function findLastDomNodeInRange(element) {
      if (element instanceof Element || element instanceof DocumentFragment) {
          return element;
      }
      const nextSibling = getLogicalNextSibling(element);
      if (nextSibling) {
          // Simple case: not the last logical sibling, so take the node before the next sibling
          return nextSibling.previousSibling;
      }
      else {
          // Harder case: there's no logical next-sibling, so recurse upwards until we find
          // a logical ancestor that does have one, or a physical element
          const logicalParent = getLogicalParent(element);
          return logicalParent instanceof Element || logicalParent instanceof DocumentFragment
              ? logicalParent.lastChild
              : findLastDomNodeInRange(logicalParent);
      }
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  function applyCaptureIdToElement(element, referenceCaptureId) {
      element.setAttribute(getCaptureIdAttributeName(referenceCaptureId), '');
  }
  function getElementByCaptureId(referenceCaptureId) {
      const selector = `[${getCaptureIdAttributeName(referenceCaptureId)}]`;
      return document.querySelector(selector);
  }
  function getCaptureIdAttributeName(referenceCaptureId) {
      return `_bl_${referenceCaptureId}`;
  }
  // Support receiving ElementRef instances as args in interop calls
  const elementRefKey = '__internalId'; // Keep in sync with ElementRef.cs
  DotNet.attachReviver((key, value) => {
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, elementRefKey) && typeof value[elementRefKey] === 'string') {
          return getElementByCaptureId(value[elementRefKey]);
      }
      else {
          return value;
      }
  });

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  let interactiveRouterRendererId = undefined;
  let programmaticEnhancedNavigationHandler;
  /**
   * Checks if a click event corresponds to an <a> tag referencing a URL within the base href, and that interception
   * isn't bypassed (e.g., by a 'download' attribute or the user holding a meta key while clicking).
   * @param event The event that occurred
   * @param callbackIfIntercepted A callback that will be invoked if the event corresponds to a click on an <a> that can be intercepted.
   */
  function handleClickForNavigationInterception(event, callbackIfIntercepted) {
      if (event.button !== 0 || eventHasSpecialKey(event)) {
          // Don't stop ctrl/meta-click (etc) from opening links in new tabs/windows
          return;
      }
      if (event.defaultPrevented) {
          return;
      }
      // Intercept clicks on all <a> elements where the href is within the <base href> URI space
      // We must explicitly check if it has an 'href' attribute, because if it doesn't, the result might be null or an empty string depending on the browser
      const anchorTarget = findAnchorTarget(event);
      if (anchorTarget && canProcessAnchor(anchorTarget)) {
          const anchorHref = anchorTarget.getAttribute('href');
          const absoluteHref = toAbsoluteUri(anchorHref);
          if (isWithinBaseUriSpace(absoluteHref)) {
              event.preventDefault();
              callbackIfIntercepted(absoluteHref);
          }
      }
  }
  function isWithinBaseUriSpace(href) {
      const baseUriWithoutTrailingSlash = toBaseUriWithoutTrailingSlash(document.baseURI);
      const nextChar = href.charAt(baseUriWithoutTrailingSlash.length);
      return href.startsWith(baseUriWithoutTrailingSlash)
          && (nextChar === '' || nextChar === '/' || nextChar === '?' || nextChar === '#');
  }
  function isSamePageWithHash(absoluteHref) {
      const url = new URL(absoluteHref);
      return url.hash !== '' && location.origin === url.origin && location.pathname === url.pathname && location.search === url.search;
  }
  function performScrollToElementOnTheSamePage(absoluteHref) {
      const hashIndex = absoluteHref.indexOf('#');
      if (hashIndex === absoluteHref.length - 1) {
          return;
      }
      const identifier = absoluteHref.substring(hashIndex + 1);
      scrollToElement(identifier);
  }
  function scrollToElement(identifier) {
      document.getElementById(identifier)?.scrollIntoView();
  }
  function hasProgrammaticEnhancedNavigationHandler() {
      return programmaticEnhancedNavigationHandler !== undefined;
  }
  function performProgrammaticEnhancedNavigation(absoluteInternalHref, replace) {
      {
          throw new Error('No enhanced programmatic navigation handler has been attached');
      }
  }
  function toBaseUriWithoutTrailingSlash(baseUri) {
      return baseUri.substring(0, baseUri.lastIndexOf('/'));
  }
  let testAnchor;
  function toAbsoluteUri(relativeUri) {
      testAnchor = testAnchor || document.createElement('a');
      testAnchor.href = relativeUri;
      return testAnchor.href;
  }
  function eventHasSpecialKey(event) {
      return event.ctrlKey || event.shiftKey || event.altKey || event.metaKey;
  }
  function canProcessAnchor(anchorTarget) {
      const targetAttributeValue = anchorTarget.getAttribute('target');
      const opensInSameFrame = !targetAttributeValue || targetAttributeValue === '_self';
      return opensInSameFrame && anchorTarget.hasAttribute('href') && !anchorTarget.hasAttribute('download');
  }
  function findAnchorTarget(event) {
      const path = event.composedPath && event.composedPath();
      if (path) {
          // This logic works with events that target elements within a shadow root,
          // as long as the shadow mode is 'open'. For closed shadows, we can't possibly
          // know what internal element was clicked.
          for (let i = 0; i < path.length; i++) {
              const candidate = path[i];
              if (candidate instanceof HTMLAnchorElement || candidate instanceof SVGAElement) {
                  return candidate;
              }
          }
      }
      return null;
  }
  function hasInteractiveRouter() {
      return interactiveRouterRendererId !== undefined;
  }
  function getInteractiveRouterRendererId() {
      return interactiveRouterRendererId;
  }
  function setHasInteractiveRouter(rendererId) {
      if (interactiveRouterRendererId !== undefined && interactiveRouterRendererId !== rendererId) {
          throw new Error('Only one interactive runtime may enable navigation interception at a time.');
      }
      interactiveRouterRendererId = rendererId;
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  let hasRegisteredNavigationEventListeners = false;
  let currentHistoryIndex = 0;
  let currentLocationChangingCallId = 0;
  const navigationCallbacks = new Map();
  let popStateCallback = onBrowserInitiatedPopState;
  let resolveCurrentNavigation = null;
  // These are the functions we're making available for invocation from .NET
  const internalFunctions = {
      listenForNavigationEvents,
      enableNavigationInterception: setHasInteractiveRouter,
      setHasLocationChangingListeners,
      endLocationChanging,
      navigateTo: navigateToFromDotNet,
      refresh,
      getBaseURI: () => document.baseURI,
      getLocationHref: () => location.href,
      scrollToElement,
  };
  function listenForNavigationEvents(rendererId, locationChangedCallback, locationChangingCallback) {
      navigationCallbacks.set(rendererId, {
          rendererId,
          hasLocationChangingEventListeners: false,
          locationChanged: locationChangedCallback,
          locationChanging: locationChangingCallback,
      });
      if (hasRegisteredNavigationEventListeners) {
          return;
      }
      hasRegisteredNavigationEventListeners = true;
      window.addEventListener('popstate', onPopState);
      currentHistoryIndex = history.state?._index ?? 0;
  }
  function setHasLocationChangingListeners(rendererId, hasListeners) {
      const callbacks = navigationCallbacks.get(rendererId);
      if (!callbacks) {
          throw new Error(`Renderer with ID '${rendererId}' is not listening for navigation events`);
      }
      callbacks.hasLocationChangingEventListeners = hasListeners;
  }
  function attachToEventDelegator(eventDelegator) {
      // We need to respond to clicks on <a> elements *after* the EventDelegator has finished
      // running its simulated bubbling process so that we can respect any preventDefault requests.
      // So instead of registering our own native event, register using the EventDelegator.
      eventDelegator.notifyAfterClick(event => {
          if (!hasInteractiveRouter()) {
              return;
          }
          handleClickForNavigationInterception(event, absoluteInternalHref => {
              performInternalNavigation(absoluteInternalHref, /* interceptedLink */ true, /* replace */ false);
          });
      });
  }
  function refresh(forceReload) {
      if (!forceReload && hasProgrammaticEnhancedNavigationHandler()) {
          performProgrammaticEnhancedNavigation();
      }
      else {
          location.reload();
      }
  }
  function navigateTo(uri, forceLoadOrOptions, replaceIfUsingOldOverload = false) {
      // Normalize the parameters to the newer overload (i.e., using NavigationOptions)
      const options = forceLoadOrOptions instanceof Object
          ? forceLoadOrOptions
          : { forceLoad: forceLoadOrOptions, replaceHistoryEntry: replaceIfUsingOldOverload };
      navigateToCore(uri, options);
  }
  function navigateToFromDotNet(uri, options) {
      // The location changing callback is called from .NET for programmatic navigations originating from .NET.
      // In this case, we shouldn't invoke the callback again from the JS side.
      navigateToCore(uri, options, /* skipLocationChangingCallback */ true);
  }
  function navigateToCore(uri, options, skipLocationChangingCallback = false) {
      const absoluteUri = toAbsoluteUri(uri);
      if (!options.forceLoad && isWithinBaseUriSpace(absoluteUri)) {
          if (shouldUseClientSideRouting()) {
              performInternalNavigation(absoluteUri, false, options.replaceHistoryEntry, options.historyEntryState, skipLocationChangingCallback);
          }
          else {
              performProgrammaticEnhancedNavigation(absoluteUri, options.replaceHistoryEntry);
          }
      }
      else {
          // For external navigation, we work in terms of the originally-supplied uri string,
          // not the computed absoluteUri. This is in case there are some special URI formats
          // we're unable to translate into absolute URIs.
          performExternalNavigation(uri, options.replaceHistoryEntry);
      }
  }
  function performExternalNavigation(uri, replace) {
      if (location.href === uri) {
          // If you're already on this URL, you can't append another copy of it to the history stack,
          // so we can ignore the 'replace' flag. However, reloading the same URL you're already on
          // requires special handling to avoid triggering browser-specific behavior issues.
          // For details about what this fixes and why, see https://github.com/dotnet/aspnetcore/pull/10839
          const temporaryUri = uri + '?';
          history.replaceState(null, '', temporaryUri);
          location.replace(uri);
      }
      else if (replace) {
          location.replace(uri);
      }
      else {
          location.href = uri;
      }
  }
  async function performInternalNavigation(absoluteInternalHref, interceptedLink, replace, state = undefined, skipLocationChangingCallback = false) {
      ignorePendingNavigation();
      if (isSamePageWithHash(absoluteInternalHref)) {
          saveToBrowserHistory(absoluteInternalHref, replace, state);
          performScrollToElementOnTheSamePage(absoluteInternalHref);
          return;
      }
      const callbacks = getInteractiveRouterNavigationCallbacks();
      if (!skipLocationChangingCallback && callbacks?.hasLocationChangingEventListeners) {
          const shouldContinueNavigation = await notifyLocationChanging(absoluteInternalHref, state, interceptedLink, callbacks);
          if (!shouldContinueNavigation) {
              return;
          }
      }
      // Since this was *not* triggered by a back/forward gesture (that goes through a different
      // code path starting with a popstate event), we don't want to preserve the current scroll
      // position, so reset it.
      // To avoid ugly flickering effects, we don't want to change the scroll position until
      // we render the new page. As a best approximation, wait until the next batch.
      resetScrollAfterNextBatch();
      saveToBrowserHistory(absoluteInternalHref, replace, state);
      await notifyLocationChanged(interceptedLink);
  }
  function saveToBrowserHistory(absoluteInternalHref, replace, state = undefined) {
      if (!replace) {
          currentHistoryIndex++;
          history.pushState({
              userState: state,
              _index: currentHistoryIndex,
          }, /* ignored title */ '', absoluteInternalHref);
      }
      else {
          history.replaceState({
              userState: state,
              _index: currentHistoryIndex,
          }, /* ignored title */ '', absoluteInternalHref);
      }
  }
  function navigateHistoryWithoutPopStateCallback(delta) {
      return new Promise(resolve => {
          const oldPopStateCallback = popStateCallback;
          popStateCallback = () => {
              popStateCallback = oldPopStateCallback;
              resolve();
          };
          history.go(delta);
      });
  }
  function ignorePendingNavigation() {
      if (resolveCurrentNavigation) {
          resolveCurrentNavigation(false);
          resolveCurrentNavigation = null;
      }
  }
  function notifyLocationChanging(uri, state, intercepted, callbacks) {
      return new Promise(resolve => {
          ignorePendingNavigation();
          currentLocationChangingCallId++;
          resolveCurrentNavigation = resolve;
          callbacks.locationChanging(currentLocationChangingCallId, uri, state, intercepted);
      });
  }
  function endLocationChanging(callId, shouldContinueNavigation) {
      if (resolveCurrentNavigation && callId === currentLocationChangingCallId) {
          resolveCurrentNavigation(shouldContinueNavigation);
          resolveCurrentNavigation = null;
      }
  }
  async function onBrowserInitiatedPopState(state) {
      ignorePendingNavigation();
      const callbacks = getInteractiveRouterNavigationCallbacks();
      if (callbacks?.hasLocationChangingEventListeners) {
          const index = state.state?._index ?? 0;
          const userState = state.state?.userState;
          const delta = index - currentHistoryIndex;
          const uri = location.href;
          // Temporarily revert the navigation until we confirm if the navigation should continue.
          await navigateHistoryWithoutPopStateCallback(-delta);
          const shouldContinueNavigation = await notifyLocationChanging(uri, userState, false, callbacks);
          if (!shouldContinueNavigation) {
              return;
          }
          await navigateHistoryWithoutPopStateCallback(delta);
      }
      // We don't know if popstate was triggered for a navigation that can be handled by the client-side router,
      // so we treat it as a intercepted link to be safe.
      await notifyLocationChanged(/* interceptedLink */ true);
  }
  async function notifyLocationChanged(interceptedLink, internalDestinationHref) {
      const uri = location.href;
      await Promise.all(Array.from(navigationCallbacks, async ([rendererId, callbacks]) => {
          if (isRendererAttached(rendererId)) {
              await callbacks.locationChanged(uri, history.state?.userState, interceptedLink);
          }
      }));
  }
  async function onPopState(state) {
      if (popStateCallback && shouldUseClientSideRouting()) {
          await popStateCallback(state);
      }
      currentHistoryIndex = history.state?._index ?? 0;
  }
  function getInteractiveRouterNavigationCallbacks() {
      const interactiveRouterRendererId = getInteractiveRouterRendererId();
      if (interactiveRouterRendererId === undefined) {
          return undefined;
      }
      return navigationCallbacks.get(interactiveRouterRendererId);
  }
  function shouldUseClientSideRouting() {
      return hasInteractiveRouter() || !hasProgrammaticEnhancedNavigationHandler();
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  // Updating the attributes/properties on DOM elements involves a whole range of special cases, because
  // depending on the element type, there are special rules for needing to update other properties or
  // to only perform the changes in a specific order.
  //
  // This module provides helpers for doing that, and is shared by the interactive renderer (BrowserRenderer)
  // and the SSR DOM merging logic.
  const deferredValuePropname = '_blazorDeferredValue';
  function tryApplySpecialProperty(element, name, value) {
      switch (name) {
          case 'value':
              return tryApplyValueProperty(element, value);
          case 'checked':
              return tryApplyCheckedProperty(element, value);
          default:
              return false;
      }
  }
  function applyAnyDeferredValue(element) {
      // We handle setting 'value' on a <select> in three different ways:
      // [1] When inserting a corresponding <option>, in case you're dynamically adding options.
      //     This is the case below.
      // [2] After we finish inserting the <select>, in case the descendant options are being
      //     added as an opaque markup block rather than individually. This is the other case below.
      // [3] In case the the value of the select and the option value is changed in the same batch.
      //     We just receive an attribute frame and have to set the select value afterwards.
      // We also defer setting the 'value' property for <input> because certain types of inputs have
      // default attribute values that may incorrectly constain the specified 'value'.
      // For example, range inputs have default 'min' and 'max' attributes that may incorrectly
      // clamp the 'value' property if it is applied before custom 'min' and 'max' attributes.
      if (element instanceof HTMLOptionElement) {
          // Situation 1
          trySetSelectValueFromOptionElement(element);
      }
      else if (deferredValuePropname in element) {
          // Situation 2
          const deferredValue = element[deferredValuePropname];
          setDeferredElementValue(element, deferredValue);
      }
  }
  function tryApplyCheckedProperty(element, value) {
      // Certain elements have built-in behaviour for their 'checked' property
      if (element.tagName === 'INPUT') {
          element.checked = value !== null;
          return true;
      }
      else {
          return false;
      }
  }
  function tryApplyValueProperty(element, value) {
      // Certain elements have built-in behaviour for their 'value' property
      if (value && element.tagName === 'INPUT') {
          value = normalizeInputValue(value, element);
      }
      switch (element.tagName) {
          case 'INPUT':
          case 'SELECT':
          case 'TEXTAREA': {
              // <select> is special, in that anything we write to .value will be lost if there
              // isn't yet a matching <option>. To maintain the expected behavior no matter the
              // element insertion/update order, preserve the desired value separately so
              // we can recover it when inserting any matching <option> or after inserting an
              // entire markup block of descendants.
              // We also defer setting the 'value' property for <input> because certain types of inputs have
              // default attribute values that may incorrectly constain the specified 'value'.
              // For example, range inputs have default 'min' and 'max' attributes that may incorrectly
              // clamp the 'value' property if it is applied before custom 'min' and 'max' attributes.
              if (value && element instanceof HTMLSelectElement && isMultipleSelectElement(element)) {
                  value = JSON.parse(value);
              }
              setDeferredElementValue(element, value);
              element[deferredValuePropname] = value;
              return true;
          }
          case 'OPTION': {
              if (value || value === '') {
                  element.setAttribute('value', value);
              }
              else {
                  element.removeAttribute('value');
              }
              // See above for why we have this special handling for <select>/<option>
              // Situation 3
              trySetSelectValueFromOptionElement(element);
              return true;
          }
          default:
              return false;
      }
  }
  function normalizeInputValue(value, element) {
      // Time inputs (e.g. 'time' and 'datetime-local') misbehave on chromium-based
      // browsers when a time is set that includes a seconds value of '00', most notably
      // when entered from keyboard input. This behavior is not limited to specific
      // 'step' attribute values, so we always remove the trailing seconds value if the
      // time ends in '00'.
      // Similarly, if a time-related element doesn't have any 'step' attribute, browsers
      // treat this as "round to whole number of minutes" making it invalid to pass any
      // 'seconds' value, so in that case we strip off the 'seconds' part of the value.
      switch (element.getAttribute('type')) {
          case 'time':
              return value.length === 8 && (value.endsWith('00') || !element.hasAttribute('step'))
                  ? value.substring(0, 5)
                  : value;
          case 'datetime-local':
              return value.length === 19 && (value.endsWith('00') || !element.hasAttribute('step'))
                  ? value.substring(0, 16)
                  : value;
          default:
              return value;
      }
  }
  function isMultipleSelectElement(element) {
      return element.type === 'select-multiple';
  }
  function setSingleSelectElementValue(element, value) {
      // There's no sensible way to represent a select option with value 'null', because
      // (1) HTML attributes can't have null values - the closest equivalent is absence of the attribute
      // (2) When picking an <option> with no 'value' attribute, the browser treats the value as being the
      //     *text content* on that <option> element. Trying to suppress that default behavior would involve
      //     a long chain of special-case hacks, as well as being breaking vs 3.x.
      // So, the most plausible 'null' equivalent is an empty string. It's unfortunate that people can't
      // write <option value=@someNullVariable>, and that we can never distinguish between null and empty
      // string in a bound <select>, but that's a limit in the representational power of HTML.
      element.value = value || '';
  }
  function setMultipleSelectElementValue(element, value) {
      value ||= [];
      for (let i = 0; i < element.options.length; i++) {
          element.options[i].selected = value.indexOf(element.options[i].value) !== -1;
      }
  }
  function setDeferredElementValue(element, value) {
      if (element instanceof HTMLSelectElement) {
          if (isMultipleSelectElement(element)) {
              setMultipleSelectElementValue(element, value);
          }
          else {
              setSingleSelectElementValue(element, value);
          }
      }
      else {
          element.value = value;
      }
  }
  function trySetSelectValueFromOptionElement(optionElement) {
      const selectElem = findClosestAncestorSelectElement(optionElement);
      if (!isBlazorSelectElement(selectElem)) {
          return false;
      }
      if (isMultipleSelectElement(selectElem)) {
          optionElement.selected = selectElem._blazorDeferredValue.indexOf(optionElement.value) !== -1;
      }
      else {
          if (selectElem._blazorDeferredValue !== optionElement.value) {
              return false;
          }
          setSingleSelectElementValue(selectElem, optionElement.value);
          delete selectElem._blazorDeferredValue;
      }
      return true;
      function isBlazorSelectElement(selectElem) {
          return !!selectElem && (deferredValuePropname in selectElem);
      }
  }
  function findClosestAncestorSelectElement(element) {
      while (element) {
          if (element instanceof HTMLSelectElement) {
              return element;
          }
          else {
              element = element.parentElement;
          }
      }
      return null;
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const sharedTemplateElemForParsing = document.createElement('template');
  const sharedSvgElemForParsing = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const elementsToClearOnRootComponentRender = new Set();
  const internalAttributeNamePrefix = '__internal_';
  const eventPreventDefaultAttributeNamePrefix = 'preventDefault_';
  const eventStopPropagationAttributeNamePrefix = 'stopPropagation_';
  const interactiveRootComponentPropname = Symbol();
  const preserveContentOnDisposalPropname = Symbol();
  class BrowserRenderer {
      constructor(browserRendererId) {
          this.rootComponentIds = new Set();
          this.childComponentLocations = {};
          this.eventDelegator = new EventDelegator(browserRendererId);
          // We don't yet know whether or not navigation interception will be enabled, but in case it will be,
          // we wire up the navigation manager to the event delegator so it has the option to participate
          // in the synthetic event bubbling process later
          attachToEventDelegator(this.eventDelegator);
      }
      getRootComponentCount() {
          return this.rootComponentIds.size;
      }
      attachRootComponentToLogicalElement(componentId, element, appendContent) {
          if (isInteractiveRootComponentElement(element)) {
              throw new Error(`Root component '${componentId}' could not be attached because its target element is already associated with a root component`);
          }
          // If we want to append content to the end of the element, we create a new logical child container
          // at the end of the element and treat that as the new parent.
          if (appendContent) {
              const indexAfterLastChild = getLogicalChildrenArray(element).length;
              element = createAndInsertLogicalContainer(element, indexAfterLastChild);
          }
          markAsInteractiveRootComponentElement(element, true);
          this.attachComponentToElement(componentId, element);
          this.rootComponentIds.add(componentId);
          elementsToClearOnRootComponentRender.add(element);
      }
      updateComponent(batch, componentId, edits, referenceFrames) {
          const element = this.childComponentLocations[componentId];
          if (!element) {
              throw new Error(`No element is currently associated with component ${componentId}`);
          }
          // On the first render for each root component, clear any existing content (e.g., prerendered)
          if (elementsToClearOnRootComponentRender.delete(element)) {
              emptyLogicalElement(element);
              if (element instanceof Comment) {
                  // We sanitize start comments by removing all the information from it now that we don't need it anymore
                  // as it adds noise to the DOM.
                  element.textContent = '!';
              }
          }
          const ownerDocument = getClosestDomElement(element)?.getRootNode();
          const activeElementBefore = ownerDocument && ownerDocument.activeElement;
          this.applyEdits(batch, componentId, element, 0, edits, referenceFrames);
          // Try to restore focus in case it was lost due to an element move
          if ((activeElementBefore instanceof HTMLElement) && ownerDocument && ownerDocument.activeElement !== activeElementBefore) {
              activeElementBefore.focus();
          }
      }
      disposeComponent(componentId) {
          if (this.rootComponentIds.delete(componentId)) {
              // When disposing a root component, the container element won't be removed from the DOM (because there's
              // no parent to remove that child), so we empty it to restore it to the state it was in before the root
              // component was added.
              const logicalElement = this.childComponentLocations[componentId];
              markAsInteractiveRootComponentElement(logicalElement, false);
              if (shouldPreserveContentOnInteractiveComponentDisposal(logicalElement)) {
                  elementsToClearOnRootComponentRender.add(logicalElement);
              }
              else {
                  emptyLogicalElement(logicalElement);
              }
          }
          delete this.childComponentLocations[componentId];
      }
      disposeEventHandler(eventHandlerId) {
          this.eventDelegator.removeListener(eventHandlerId);
      }
      attachComponentToElement(componentId, element) {
          this.childComponentLocations[componentId] = element;
      }
      applyEdits(batch, componentId, parent, childIndex, edits, referenceFrames) {
          let currentDepth = 0;
          let childIndexAtCurrentDepth = childIndex;
          let permutationList;
          const arrayBuilderSegmentReader = batch.arrayBuilderSegmentReader;
          const editReader = batch.editReader;
          const frameReader = batch.frameReader;
          const editsValues = arrayBuilderSegmentReader.values(edits);
          const editsOffset = arrayBuilderSegmentReader.offset(edits);
          const editsLength = arrayBuilderSegmentReader.count(edits);
          const maxEditIndexExcl = editsOffset + editsLength;
          for (let editIndex = editsOffset; editIndex < maxEditIndexExcl; editIndex++) {
              const edit = batch.diffReader.editsEntry(editsValues, editIndex);
              const editType = editReader.editType(edit);
              switch (editType) {
                  case EditType.prependFrame: {
                      const frameIndex = editReader.newTreeIndex(edit);
                      const frame = batch.referenceFramesEntry(referenceFrames, frameIndex);
                      const siblingIndex = editReader.siblingIndex(edit);
                      this.insertFrame(batch, componentId, parent, childIndexAtCurrentDepth + siblingIndex, referenceFrames, frame, frameIndex);
                      break;
                  }
                  case EditType.removeFrame: {
                      const siblingIndex = editReader.siblingIndex(edit);
                      removeLogicalChild(parent, childIndexAtCurrentDepth + siblingIndex);
                      break;
                  }
                  case EditType.setAttribute: {
                      const frameIndex = editReader.newTreeIndex(edit);
                      const frame = batch.referenceFramesEntry(referenceFrames, frameIndex);
                      const siblingIndex = editReader.siblingIndex(edit);
                      const element = getLogicalChild(parent, childIndexAtCurrentDepth + siblingIndex);
                      if (element instanceof Element) {
                          this.applyAttribute(batch, componentId, element, frame);
                      }
                      else {
                          throw new Error('Cannot set attribute on non-element child');
                      }
                      break;
                  }
                  case EditType.removeAttribute: {
                      // Note that we don't have to dispose the info we track about event handlers here, because the
                      // disposed event handler IDs are delivered separately (in the 'disposedEventHandlerIds' array)
                      const siblingIndex = editReader.siblingIndex(edit);
                      const element = getLogicalChild(parent, childIndexAtCurrentDepth + siblingIndex);
                      if (element instanceof Element) {
                          const attributeName = editReader.removedAttributeName(edit);
                          this.setOrRemoveAttributeOrProperty(element, attributeName, null);
                      }
                      else {
                          throw new Error('Cannot remove attribute from non-element child');
                      }
                      break;
                  }
                  case EditType.updateText: {
                      const frameIndex = editReader.newTreeIndex(edit);
                      const frame = batch.referenceFramesEntry(referenceFrames, frameIndex);
                      const siblingIndex = editReader.siblingIndex(edit);
                      const textNode = getLogicalChild(parent, childIndexAtCurrentDepth + siblingIndex);
                      if (textNode instanceof Text) {
                          textNode.textContent = frameReader.textContent(frame);
                      }
                      else {
                          throw new Error('Cannot set text content on non-text child');
                      }
                      break;
                  }
                  case EditType.updateMarkup: {
                      const frameIndex = editReader.newTreeIndex(edit);
                      const frame = batch.referenceFramesEntry(referenceFrames, frameIndex);
                      const siblingIndex = editReader.siblingIndex(edit);
                      removeLogicalChild(parent, childIndexAtCurrentDepth + siblingIndex);
                      this.insertMarkup(batch, parent, childIndexAtCurrentDepth + siblingIndex, frame);
                      break;
                  }
                  case EditType.stepIn: {
                      const siblingIndex = editReader.siblingIndex(edit);
                      parent = getLogicalChild(parent, childIndexAtCurrentDepth + siblingIndex);
                      currentDepth++;
                      childIndexAtCurrentDepth = 0;
                      break;
                  }
                  case EditType.stepOut: {
                      parent = getLogicalParent(parent);
                      currentDepth--;
                      childIndexAtCurrentDepth = currentDepth === 0 ? childIndex : 0; // The childIndex is only ever nonzero at zero depth
                      break;
                  }
                  case EditType.permutationListEntry: {
                      permutationList = permutationList || [];
                      permutationList.push({
                          fromSiblingIndex: childIndexAtCurrentDepth + editReader.siblingIndex(edit),
                          toSiblingIndex: childIndexAtCurrentDepth + editReader.moveToSiblingIndex(edit),
                      });
                      break;
                  }
                  case EditType.permutationListEnd: {
                      permuteLogicalChildren(parent, permutationList);
                      permutationList = undefined;
                      break;
                  }
                  default: {
                      const unknownType = editType; // Compile-time verification that the switch was exhaustive
                      throw new Error(`Unknown edit type: ${unknownType}`);
                  }
              }
          }
      }
      insertFrame(batch, componentId, parent, childIndex, frames, frame, frameIndex) {
          const frameReader = batch.frameReader;
          const frameType = frameReader.frameType(frame);
          switch (frameType) {
              case FrameType.element:
                  this.insertElement(batch, componentId, parent, childIndex, frames, frame, frameIndex);
                  return 1;
              case FrameType.text:
                  this.insertText(batch, parent, childIndex, frame);
                  return 1;
              case FrameType.attribute:
                  throw new Error('Attribute frames should only be present as leading children of element frames.');
              case FrameType.component:
                  this.insertComponent(batch, parent, childIndex, frame);
                  return 1;
              case FrameType.region:
                  return this.insertFrameRange(batch, componentId, parent, childIndex, frames, frameIndex + 1, frameIndex + frameReader.subtreeLength(frame));
              case FrameType.elementReferenceCapture:
                  if (parent instanceof Element) {
                      applyCaptureIdToElement(parent, frameReader.elementReferenceCaptureId(frame));
                      return 0; // A "capture" is a child in the diff, but has no node in the DOM
                  }
                  else {
                      throw new Error('Reference capture frames can only be children of element frames.');
                  }
              case FrameType.markup:
                  this.insertMarkup(batch, parent, childIndex, frame);
                  return 1;
              case FrameType.namedEvent: // Not used on the JS side
                  return 0;
              default: {
                  const unknownType = frameType; // Compile-time verification that the switch was exhaustive
                  throw new Error(`Unknown frame type: ${unknownType}`);
              }
          }
      }
      insertElement(batch, componentId, parent, childIndex, frames, frame, frameIndex) {
          const frameReader = batch.frameReader;
          const tagName = frameReader.elementName(frame);
          const newDomElementRaw = (tagName === 'svg' || isSvgElement(parent)) ?
              document.createElementNS('http://www.w3.org/2000/svg', tagName) :
              document.createElement(tagName);
          const newElement = toLogicalElement(newDomElementRaw);
          let inserted = false;
          // Apply attributes
          const descendantsEndIndexExcl = frameIndex + frameReader.subtreeLength(frame);
          for (let descendantIndex = frameIndex + 1; descendantIndex < descendantsEndIndexExcl; descendantIndex++) {
              const descendantFrame = batch.referenceFramesEntry(frames, descendantIndex);
              if (frameReader.frameType(descendantFrame) === FrameType.attribute) {
                  this.applyAttribute(batch, componentId, newDomElementRaw, descendantFrame);
              }
              else {
                  insertLogicalChild(newDomElementRaw, parent, childIndex);
                  inserted = true;
                  // As soon as we see a non-attribute child, all the subsequent child frames are
                  // not attributes, so bail out and insert the remnants recursively
                  this.insertFrameRange(batch, componentId, newElement, 0, frames, descendantIndex, descendantsEndIndexExcl);
                  break;
              }
          }
          // this element did not have any children, so it's not inserted yet.
          if (!inserted) {
              insertLogicalChild(newDomElementRaw, parent, childIndex);
          }
          applyAnyDeferredValue(newDomElementRaw);
      }
      insertComponent(batch, parent, childIndex, frame) {
          const containerElement = createAndInsertLogicalContainer(parent, childIndex);
          // All we have to do is associate the child component ID with its location. We don't actually
          // do any rendering here, because the diff for the child will appear later in the render batch.
          const childComponentId = batch.frameReader.componentId(frame);
          this.attachComponentToElement(childComponentId, containerElement);
      }
      insertText(batch, parent, childIndex, textFrame) {
          const textContent = batch.frameReader.textContent(textFrame);
          const newTextNode = document.createTextNode(textContent);
          insertLogicalChild(newTextNode, parent, childIndex);
      }
      insertMarkup(batch, parent, childIndex, markupFrame) {
          const markupContainer = createAndInsertLogicalContainer(parent, childIndex);
          const markupContent = batch.frameReader.markupContent(markupFrame);
          const parsedMarkup = parseMarkup(markupContent, isSvgElement(parent));
          let logicalSiblingIndex = 0;
          while (parsedMarkup.firstChild) {
              insertLogicalChild(parsedMarkup.firstChild, markupContainer, logicalSiblingIndex++);
          }
      }
      applyAttribute(batch, componentId, toDomElement, attributeFrame) {
          const frameReader = batch.frameReader;
          const attributeName = frameReader.attributeName(attributeFrame);
          const eventHandlerId = frameReader.attributeEventHandlerId(attributeFrame);
          if (eventHandlerId) {
              const eventName = stripOnPrefix(attributeName);
              this.eventDelegator.setListener(toDomElement, eventName, eventHandlerId, componentId);
              return;
          }
          const value = frameReader.attributeValue(attributeFrame);
          this.setOrRemoveAttributeOrProperty(toDomElement, attributeName, value);
      }
      insertFrameRange(batch, componentId, parent, childIndex, frames, startIndex, endIndexExcl) {
          const origChildIndex = childIndex;
          for (let index = startIndex; index < endIndexExcl; index++) {
              const frame = batch.referenceFramesEntry(frames, index);
              const numChildrenInserted = this.insertFrame(batch, componentId, parent, childIndex, frames, frame, index);
              childIndex += numChildrenInserted;
              // Skip over any descendants, since they are already dealt with recursively
              index += countDescendantFrames(batch, frame);
          }
          return (childIndex - origChildIndex); // Total number of children inserted
      }
      setOrRemoveAttributeOrProperty(element, name, valueOrNullToRemove) {
          // First see if we have special handling for this attribute
          if (!tryApplySpecialProperty(element, name, valueOrNullToRemove)) {
              // If not, maybe it's one of our internal attributes
              if (name.startsWith(internalAttributeNamePrefix)) {
                  this.applyInternalAttribute(element, name.substring(internalAttributeNamePrefix.length), valueOrNullToRemove);
              }
              else {
                  // If not, treat it as a regular DOM attribute
                  if (valueOrNullToRemove !== null) {
                      element.setAttribute(name, valueOrNullToRemove);
                  }
                  else {
                      element.removeAttribute(name);
                  }
              }
          }
      }
      applyInternalAttribute(element, internalAttributeName, value) {
          if (internalAttributeName.startsWith(eventStopPropagationAttributeNamePrefix)) {
              // Stop propagation
              const eventName = stripOnPrefix(internalAttributeName.substring(eventStopPropagationAttributeNamePrefix.length));
              this.eventDelegator.setStopPropagation(element, eventName, value !== null);
          }
          else if (internalAttributeName.startsWith(eventPreventDefaultAttributeNamePrefix)) {
              // Prevent default
              const eventName = stripOnPrefix(internalAttributeName.substring(eventPreventDefaultAttributeNamePrefix.length));
              this.eventDelegator.setPreventDefault(element, eventName, value !== null);
          }
          else {
              // The prefix makes this attribute name reserved, so any other usage is disallowed
              throw new Error(`Unsupported internal attribute '${internalAttributeName}'`);
          }
      }
  }
  function markAsInteractiveRootComponentElement(element, isInteractive) {
      element[interactiveRootComponentPropname] = isInteractive;
  }
  function isInteractiveRootComponentElement(element) {
      return element[interactiveRootComponentPropname];
  }
  function shouldPreserveContentOnInteractiveComponentDisposal(element) {
      return element[preserveContentOnDisposalPropname] === true;
  }
  function parseMarkup(markup, isSvg) {
      if (isSvg) {
          sharedSvgElemForParsing.innerHTML = markup || ' ';
          return sharedSvgElemForParsing;
      }
      else {
          sharedTemplateElemForParsing.innerHTML = markup || ' ';
          // Since this is a markup string, we want to honor the developer's intent to
          // evaluate any scripts it may contain. Scripts parsed from an innerHTML assignment
          // won't be executable by default (https://stackoverflow.com/questions/1197575/can-scripts-be-inserted-with-innerhtml)
          // but that's inconsistent with anything constructed from a sequence like:
          // - OpenElement("script")
          // - AddContent(js) or AddMarkupContent(js)
          // - CloseElement()
          // It doesn't make sense to have such an inconsistency in Blazor's interactive
          // renderer, and for back-compat with pre-.NET 8 code (when the Razor compiler always
          // used OpenElement like above), as well as consistency with static SSR, we need to make it work.
          sharedTemplateElemForParsing.content.querySelectorAll('script').forEach(oldScriptElem => {
              const newScriptElem = document.createElement('script');
              newScriptElem.textContent = oldScriptElem.textContent;
              oldScriptElem.getAttributeNames().forEach(attribName => {
                  newScriptElem.setAttribute(attribName, oldScriptElem.getAttribute(attribName));
              });
              oldScriptElem.parentNode.replaceChild(newScriptElem, oldScriptElem);
          });
          return sharedTemplateElemForParsing.content;
      }
  }
  function countDescendantFrames(batch, frame) {
      const frameReader = batch.frameReader;
      switch (frameReader.frameType(frame)) {
          // The following frame types have a subtree length. Other frames may use that memory slot
          // to mean something else, so we must not read it. We should consider having nominal subtypes
          // of RenderTreeFramePointer that prevent access to non-applicable fields.
          case FrameType.component:
          case FrameType.element:
          case FrameType.region:
              return frameReader.subtreeLength(frame) - 1;
          default:
              return 0;
      }
  }
  function stripOnPrefix(attributeName) {
      if (attributeName.startsWith('on')) {
          return attributeName.substring(2);
      }
      throw new Error(`Attribute should be an event name, but doesn't start with 'on'. Value: '${attributeName}'`);
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const browserRenderers = {};
  let shouldResetScrollAfterNextBatch = false;
  function attachRootComponentToLogicalElement(browserRendererId, logicalElement, componentId, appendContent) {
      let browserRenderer = browserRenderers[browserRendererId];
      if (!browserRenderer) {
          browserRenderer = new BrowserRenderer(browserRendererId);
          browserRenderers[browserRendererId] = browserRenderer;
      }
      browserRenderer.attachRootComponentToLogicalElement(componentId, logicalElement, appendContent);
  }
  function renderBatch(browserRendererId, batch) {
      const browserRenderer = browserRenderers[browserRendererId];
      if (!browserRenderer) {
          throw new Error(`There is no browser renderer with ID ${browserRendererId}.`);
      }
      const arrayRangeReader = batch.arrayRangeReader;
      const updatedComponentsRange = batch.updatedComponents();
      const updatedComponentsValues = arrayRangeReader.values(updatedComponentsRange);
      const updatedComponentsLength = arrayRangeReader.count(updatedComponentsRange);
      const referenceFrames = batch.referenceFrames();
      const referenceFramesValues = arrayRangeReader.values(referenceFrames);
      const diffReader = batch.diffReader;
      for (let i = 0; i < updatedComponentsLength; i++) {
          const diff = batch.updatedComponentsEntry(updatedComponentsValues, i);
          const componentId = diffReader.componentId(diff);
          const edits = diffReader.edits(diff);
          browserRenderer.updateComponent(batch, componentId, edits, referenceFramesValues);
      }
      const disposedComponentIdsRange = batch.disposedComponentIds();
      const disposedComponentIdsValues = arrayRangeReader.values(disposedComponentIdsRange);
      const disposedComponentIdsLength = arrayRangeReader.count(disposedComponentIdsRange);
      for (let i = 0; i < disposedComponentIdsLength; i++) {
          const componentId = batch.disposedComponentIdsEntry(disposedComponentIdsValues, i);
          browserRenderer.disposeComponent(componentId);
      }
      const disposedEventHandlerIdsRange = batch.disposedEventHandlerIds();
      const disposedEventHandlerIdsValues = arrayRangeReader.values(disposedEventHandlerIdsRange);
      const disposedEventHandlerIdsLength = arrayRangeReader.count(disposedEventHandlerIdsRange);
      for (let i = 0; i < disposedEventHandlerIdsLength; i++) {
          const eventHandlerId = batch.disposedEventHandlerIdsEntry(disposedEventHandlerIdsValues, i);
          browserRenderer.disposeEventHandler(eventHandlerId);
      }
      resetScrollIfNeeded();
  }
  function resetScrollAfterNextBatch() {
      shouldResetScrollAfterNextBatch = true;
  }
  function resetScrollIfNeeded() {
      if (shouldResetScrollAfterNextBatch) {
          shouldResetScrollAfterNextBatch = false;
          // This assumes the scroller is on the window itself. There isn't a general way to know
          // if some other element is playing the role of the primary scroll region.
          window.scrollTo && window.scrollTo(0, 0);
      }
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  // These IDs need to be kept in sync with RendererId.cs
  var WebRendererId;
  (function (WebRendererId) {
      WebRendererId[WebRendererId["Default"] = 0] = "Default";
      WebRendererId[WebRendererId["Server"] = 1] = "Server";
      WebRendererId[WebRendererId["WebAssembly"] = 2] = "WebAssembly";
      WebRendererId[WebRendererId["WebView"] = 3] = "WebView";
  })(WebRendererId || (WebRendererId = {}));

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const nativeDecoder = typeof TextDecoder === 'function'
      ? new TextDecoder('utf-8')
      : null;
  const decodeUtf8 = nativeDecoder ? nativeDecoder.decode.bind(nativeDecoder) : decodeImpl;
  /* !
  Logic in decodeImpl is derived from fast-text-encoding
  https://github.com/samthor/fast-text-encoding

  License for fast-text-encoding: Apache 2.0
  https://github.com/samthor/fast-text-encoding/blob/master/LICENSE
  */
  function decodeImpl(bytes) {
      let pos = 0;
      const len = bytes.length;
      const out = [];
      const substrings = [];
      while (pos < len) {
          const byte1 = bytes[pos++];
          if (byte1 === 0) {
              break; // NULL
          }
          if ((byte1 & 0x80) === 0) { // 1-byte
              out.push(byte1);
          }
          else if ((byte1 & 0xe0) === 0xc0) { // 2-byte
              const byte2 = bytes[pos++] & 0x3f;
              out.push(((byte1 & 0x1f) << 6) | byte2);
          }
          else if ((byte1 & 0xf0) === 0xe0) {
              const byte2 = bytes[pos++] & 0x3f;
              const byte3 = bytes[pos++] & 0x3f;
              out.push(((byte1 & 0x1f) << 12) | (byte2 << 6) | byte3);
          }
          else if ((byte1 & 0xf8) === 0xf0) {
              const byte2 = bytes[pos++] & 0x3f;
              const byte3 = bytes[pos++] & 0x3f;
              const byte4 = bytes[pos++] & 0x3f;
              // this can be > 0xffff, so possibly generate surrogates
              let codepoint = ((byte1 & 0x07) << 0x12) | (byte2 << 0x0c) | (byte3 << 0x06) | byte4;
              if (codepoint > 0xffff) {
                  // codepoint &= ~0x10000;
                  codepoint -= 0x10000;
                  out.push((codepoint >>> 10) & 0x3ff | 0xd800);
                  codepoint = 0xdc00 | codepoint & 0x3ff;
              }
              out.push(codepoint);
          }
          else ;
          // As a workaround for https://github.com/samthor/fast-text-encoding/issues/1,
          // make sure the 'out' array never gets too long. When it reaches a limit, we
          // stringify what we have so far and append to a list of outputs.
          if (out.length > 1024) {
              substrings.push(String.fromCharCode.apply(null, out));
              out.length = 0;
          }
      }
      substrings.push(String.fromCharCode.apply(null, out));
      return substrings.join('');
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const uint64HighPartShift = Math.pow(2, 32);
  const maxSafeNumberHighPart = Math.pow(2, 21) - 1; // The high-order int32 from Number.MAX_SAFE_INTEGER
  function readInt32LE(buffer, position) {
      return (buffer[position])
          | (buffer[position + 1] << 8)
          | (buffer[position + 2] << 16)
          | (buffer[position + 3] << 24);
  }
  function readUint32LE(buffer, position) {
      return (buffer[position])
          + (buffer[position + 1] << 8)
          + (buffer[position + 2] << 16)
          + ((buffer[position + 3] << 24) >>> 0); // The >>> 0 coerces the value to unsigned
  }
  function readUint64LE(buffer, position) {
      // This cannot be done using bit-shift operators in JavaScript, because
      // those all implicitly convert to int32
      const highPart = readUint32LE(buffer, position + 4);
      if (highPart > maxSafeNumberHighPart) {
          throw new Error(`Cannot read uint64 with high order part ${highPart}, because the result would exceed Number.MAX_SAFE_INTEGER.`);
      }
      return (highPart * uint64HighPartShift) + readUint32LE(buffer, position);
  }
  function readLEB128(buffer, position) {
      let result = 0;
      let shift = 0;
      for (let index = 0; index < 4; index++) {
          const byte = buffer[position + index];
          result |= (byte & 127) << shift;
          if (byte < 128) {
              break;
          }
          shift += 7;
      }
      return result;
  }
  function numLEB128Bytes(value) {
      return value < 128 ? 1
          : value < 16384 ? 2
              : value < 2097152 ? 3 : 4;
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const updatedComponentsEntryLength = 4; // Each is a single int32 giving the location of the data
  const referenceFramesEntryLength = 20; // 1 int for frame type, then 16 bytes for type-specific data
  const disposedComponentIdsEntryLength = 4; // Each is an int32 giving the ID
  const disposedEventHandlerIdsEntryLength = 8; // Each is an int64 giving the ID
  const editsEntryLength = 16; // 4 ints
  const stringTableEntryLength = 4; // Each is an int32 giving the string data location, or -1 for null
  class OutOfProcessRenderBatch {
      constructor(batchData) {
          this.batchData = batchData;
          const stringReader = new OutOfProcessStringReader(batchData);
          this.arrayRangeReader = new OutOfProcessArrayRangeReader(batchData);
          this.arrayBuilderSegmentReader = new OutOfProcessArrayBuilderSegmentReader(batchData);
          this.diffReader = new OutOfProcessRenderTreeDiffReader(batchData);
          this.editReader = new OutOfProcessRenderTreeEditReader(batchData, stringReader);
          this.frameReader = new OutOfProcessRenderTreeFrameReader(batchData, stringReader);
      }
      updatedComponents() {
          return readInt32LE(this.batchData, this.batchData.length - 20); // 5th-from-last int32
      }
      referenceFrames() {
          return readInt32LE(this.batchData, this.batchData.length - 16); // 4th-from-last int32
      }
      disposedComponentIds() {
          return readInt32LE(this.batchData, this.batchData.length - 12); // 3rd-from-last int32
      }
      disposedEventHandlerIds() {
          return readInt32LE(this.batchData, this.batchData.length - 8); // 2th-from-last int32
      }
      updatedComponentsEntry(values, index) {
          const tableEntryPos = values + index * updatedComponentsEntryLength;
          return readInt32LE(this.batchData, tableEntryPos);
      }
      referenceFramesEntry(values, index) {
          return values + index * referenceFramesEntryLength;
      }
      disposedComponentIdsEntry(values, index) {
          const entryPos = values + index * disposedComponentIdsEntryLength;
          return readInt32LE(this.batchData, entryPos);
      }
      disposedEventHandlerIdsEntry(values, index) {
          const entryPos = values + index * disposedEventHandlerIdsEntryLength;
          return readUint64LE(this.batchData, entryPos);
      }
  }
  class OutOfProcessRenderTreeDiffReader {
      constructor(batchDataUint8) {
          this.batchDataUint8 = batchDataUint8;
      }
      componentId(diff) {
          // First int32 is componentId
          return readInt32LE(this.batchDataUint8, diff);
      }
      edits(diff) {
          // Entries data starts after the componentId (which is a 4-byte int)
          return (diff + 4);
      }
      editsEntry(values, index) {
          return values + index * editsEntryLength;
      }
  }
  class OutOfProcessRenderTreeEditReader {
      constructor(batchDataUint8, stringReader) {
          this.batchDataUint8 = batchDataUint8;
          this.stringReader = stringReader;
      }
      editType(edit) {
          return readInt32LE(this.batchDataUint8, edit); // 1st int
      }
      siblingIndex(edit) {
          return readInt32LE(this.batchDataUint8, edit + 4); // 2nd int
      }
      newTreeIndex(edit) {
          return readInt32LE(this.batchDataUint8, edit + 8); // 3rd int
      }
      moveToSiblingIndex(edit) {
          return readInt32LE(this.batchDataUint8, edit + 8); // 3rd int
      }
      removedAttributeName(edit) {
          const stringIndex = readInt32LE(this.batchDataUint8, edit + 12); // 4th int
          return this.stringReader.readString(stringIndex);
      }
  }
  class OutOfProcessRenderTreeFrameReader {
      constructor(batchDataUint8, stringReader) {
          this.batchDataUint8 = batchDataUint8;
          this.stringReader = stringReader;
      }
      // For render frames, the 2nd-4th ints have different meanings depending on frameType.
      // It's the caller's responsibility not to evaluate properties that aren't applicable to the frameType.
      frameType(frame) {
          return readInt32LE(this.batchDataUint8, frame); // 1st int
      }
      subtreeLength(frame) {
          return readInt32LE(this.batchDataUint8, frame + 4); // 2nd int
      }
      elementReferenceCaptureId(frame) {
          const stringIndex = readInt32LE(this.batchDataUint8, frame + 4); // 2nd int
          return this.stringReader.readString(stringIndex);
      }
      componentId(frame) {
          return readInt32LE(this.batchDataUint8, frame + 8); // 3rd int
      }
      elementName(frame) {
          const stringIndex = readInt32LE(this.batchDataUint8, frame + 8); // 3rd int
          return this.stringReader.readString(stringIndex);
      }
      textContent(frame) {
          const stringIndex = readInt32LE(this.batchDataUint8, frame + 4); // 2nd int
          return this.stringReader.readString(stringIndex);
      }
      markupContent(frame) {
          const stringIndex = readInt32LE(this.batchDataUint8, frame + 4); // 2nd int
          return this.stringReader.readString(stringIndex);
      }
      attributeName(frame) {
          const stringIndex = readInt32LE(this.batchDataUint8, frame + 4); // 2nd int
          return this.stringReader.readString(stringIndex);
      }
      attributeValue(frame) {
          const stringIndex = readInt32LE(this.batchDataUint8, frame + 8); // 3rd int
          return this.stringReader.readString(stringIndex);
      }
      attributeEventHandlerId(frame) {
          return readUint64LE(this.batchDataUint8, frame + 12); // Bytes 12-19
      }
  }
  class OutOfProcessStringReader {
      constructor(batchDataUint8) {
          this.batchDataUint8 = batchDataUint8;
          // Final int gives start position of the string table
          this.stringTableStartIndex = readInt32LE(batchDataUint8, batchDataUint8.length - 4);
      }
      readString(index) {
          if (index === -1) { // Special value encodes 'null'
              return null;
          }
          else {
              const stringTableEntryPos = readInt32LE(this.batchDataUint8, this.stringTableStartIndex + index * stringTableEntryLength);
              // By default, .NET's BinaryWriter gives LEB128-length-prefixed UTF-8 data.
              // This is convenient enough to decode in JavaScript.
              const numUtf8Bytes = readLEB128(this.batchDataUint8, stringTableEntryPos);
              const charsStart = stringTableEntryPos + numLEB128Bytes(numUtf8Bytes);
              const utf8Data = new Uint8Array(this.batchDataUint8.buffer, this.batchDataUint8.byteOffset + charsStart, numUtf8Bytes);
              return decodeUtf8(utf8Data);
          }
      }
  }
  class OutOfProcessArrayRangeReader {
      constructor(batchDataUint8) {
          this.batchDataUint8 = batchDataUint8;
      }
      count(arrayRange) {
          // First int is count
          return readInt32LE(this.batchDataUint8, arrayRange);
      }
      values(arrayRange) {
          // Entries data starts after the 'count' int (i.e., after 4 bytes)
          return arrayRange + 4;
      }
  }
  class OutOfProcessArrayBuilderSegmentReader {
      constructor(batchDataUint8) {
          this.batchDataUint8 = batchDataUint8;
      }
      offset(_arrayBuilderSegment) {
          // Not used by the out-of-process representation of RenderBatch data.
          // This only exists on the ArrayBuilderSegmentReader for the shared-memory representation.
          return 0;
      }
      count(arrayBuilderSegment) {
          // First int is count
          return readInt32LE(this.batchDataUint8, arrayBuilderSegment);
      }
      values(arrayBuilderSegment) {
          // Entries data starts after the 'count' int (i.e., after 4 bytes)
          return arrayBuilderSegment + 4;
      }
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const domFunctions = {
      focus,
      focusBySelector
  };
  function focus(element, preventScroll) {
      if (element instanceof HTMLElement) {
          element.focus({ preventScroll });
      }
      else if (element instanceof SVGElement) {
          if (element.hasAttribute('tabindex')) {
              element.focus({ preventScroll });
          }
          else {
              throw new Error('Unable to focus an SVG element that does not have a tabindex.');
          }
      }
      else {
          throw new Error('Unable to focus an invalid element.');
      }
  }
  function focusBySelector(selector, preventScroll) {
      const element = document.querySelector(selector);
      if (element) {
          // If no explicit tabindex is defined, mark it as programmatically-focusable.
          // This does actually add a new HTML attribute, but it shouldn't interfere with
          // diffing because diffing only deals with the attributes you have in your code.
          if (!element.hasAttribute('tabindex')) {
              element.tabIndex = -1;
          }
          element.focus({ preventScroll: true });
      }
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const Virtualize = {
      init: init$1,
      dispose,
  };
  const dispatcherObserversByDotNetIdPropname = Symbol();
  function findClosestScrollContainer(element) {
      // If we recurse up as far as body or the document root, return null so that the
      // IntersectionObserver observes intersection with the top-level scroll viewport
      // instead of the with body/documentElement which can be arbitrarily tall.
      // See https://github.com/dotnet/aspnetcore/issues/37659 for more about what this fixes.
      if (!element || element === document.body || element === document.documentElement) {
          return null;
      }
      const style = getComputedStyle(element);
      if (style.overflowY !== 'visible') {
          return element;
      }
      return findClosestScrollContainer(element.parentElement);
  }
  function init$1(dotNetHelper, spacerBefore, spacerAfter, rootMargin = 50) {
      // Overflow anchoring can cause an ongoing scroll loop, because when we resize the spacers, the browser
      // would update the scroll position to compensate. Then the spacer would remain visible and we'd keep on
      // trying to resize it.
      const scrollContainer = findClosestScrollContainer(spacerBefore);
      (scrollContainer || document.documentElement).style.overflowAnchor = 'none';
      const rangeBetweenSpacers = document.createRange();
      if (isValidTableElement(spacerAfter.parentElement)) {
          spacerBefore.style.display = 'table-row';
          spacerAfter.style.display = 'table-row';
      }
      const intersectionObserver = new IntersectionObserver(intersectionCallback, {
          root: scrollContainer,
          rootMargin: `${rootMargin}px`,
      });
      intersectionObserver.observe(spacerBefore);
      intersectionObserver.observe(spacerAfter);
      const mutationObserverBefore = createSpacerMutationObserver(spacerBefore);
      const mutationObserverAfter = createSpacerMutationObserver(spacerAfter);
      const { observersByDotNetObjectId, id } = getObserversMapEntry(dotNetHelper);
      observersByDotNetObjectId[id] = {
          intersectionObserver,
          mutationObserverBefore,
          mutationObserverAfter,
      };
      function createSpacerMutationObserver(spacer) {
          // Without the use of thresholds, IntersectionObserver only detects binary changes in visibility,
          // so if a spacer gets resized but remains visible, no additional callbacks will occur. By unobserving
          // and reobserving spacers when they get resized, the intersection callback will re-run if they remain visible.
          const observerOptions = { attributes: true };
          const mutationObserver = new MutationObserver((mutations, observer) => {
              if (isValidTableElement(spacer.parentElement)) {
                  observer.disconnect();
                  spacer.style.display = 'table-row';
                  observer.observe(spacer, observerOptions);
              }
              intersectionObserver.unobserve(spacer);
              intersectionObserver.observe(spacer);
          });
          mutationObserver.observe(spacer, observerOptions);
          return mutationObserver;
      }
      function intersectionCallback(entries) {
          entries.forEach((entry) => {
              if (!entry.isIntersecting) {
                  return;
              }
              // To compute the ItemSize, work out the separation between the two spacers. We can't just measure an individual element
              // because each conceptual item could be made from multiple elements. Using getBoundingClientRect allows for the size to be
              // a fractional value. It's important not to add or subtract any such fractional values (e.g., to subtract the 'top' of
              // one item from the 'bottom' of another to get the distance between them) because floating point errors would cause
              // scrolling glitches.
              rangeBetweenSpacers.setStartAfter(spacerBefore);
              rangeBetweenSpacers.setEndBefore(spacerAfter);
              const spacerSeparation = rangeBetweenSpacers.getBoundingClientRect().height;
              const containerSize = entry.rootBounds?.height;
              if (entry.target === spacerBefore) {
                  dotNetHelper.invokeMethodAsync('OnSpacerBeforeVisible', entry.intersectionRect.top - entry.boundingClientRect.top, spacerSeparation, containerSize);
              }
              else if (entry.target === spacerAfter && spacerAfter.offsetHeight > 0) {
                  // When we first start up, both the "before" and "after" spacers will be visible, but it's only relevant to raise a
                  // single event to load the initial data. To avoid raising two events, skip the one for the "after" spacer if we know
                  // it's meaningless to talk about any overlap into it.
                  dotNetHelper.invokeMethodAsync('OnSpacerAfterVisible', entry.boundingClientRect.bottom - entry.intersectionRect.bottom, spacerSeparation, containerSize);
              }
          });
      }
      function isValidTableElement(element) {
          if (element === null) {
              return false;
          }
          return ((element instanceof HTMLTableElement && element.style.display === '') || element.style.display === 'table')
              || ((element instanceof HTMLTableSectionElement && element.style.display === '') || element.style.display === 'table-row-group');
      }
  }
  function getObserversMapEntry(dotNetHelper) {
      const dotNetHelperDispatcher = dotNetHelper['_callDispatcher'];
      const dotNetHelperId = dotNetHelper['_id'];
      dotNetHelperDispatcher[dispatcherObserversByDotNetIdPropname] ??= {};
      return {
          observersByDotNetObjectId: dotNetHelperDispatcher[dispatcherObserversByDotNetIdPropname],
          id: dotNetHelperId,
      };
  }
  function dispose(dotNetHelper) {
      const { observersByDotNetObjectId, id } = getObserversMapEntry(dotNetHelper);
      const observers = observersByDotNetObjectId[id];
      if (observers) {
          observers.intersectionObserver.disconnect();
          observers.mutationObserverBefore.disconnect();
          observers.mutationObserverAfter.disconnect();
          dotNetHelper.dispose();
          delete observersByDotNetObjectId[id];
      }
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const PageTitle = {
      getAndRemoveExistingTitle,
  };
  function getAndRemoveExistingTitle() {
      // Other <title> elements may exist outside <head> (e.g., inside <svg> elements) but they aren't page titles
      const titleElements = document.head ? document.head.getElementsByTagName('title') : [];
      if (titleElements.length === 0) {
          return null;
      }
      let existingTitle = null;
      for (let index = titleElements.length - 1; index >= 0; index--) {
          const currentTitleElement = titleElements[index];
          const previousSibling = currentTitleElement.previousSibling;
          const isBlazorTitle = previousSibling instanceof Comment && getLogicalParent(previousSibling) !== null;
          if (isBlazorTitle) {
              continue;
          }
          if (existingTitle === null) {
              existingTitle = currentTitleElement.textContent;
          }
          currentTitleElement.parentNode?.removeChild(currentTitleElement);
      }
      return existingTitle;
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const InputFile = {
      init,
      toImageFile,
      readFileData,
  };
  function init(callbackWrapper, elem) {
      elem._blazorInputFileNextFileId = 0;
      elem.addEventListener('click', function () {
          // Permits replacing an existing file with a new one of the same file name.
          elem.value = '';
      });
      elem.addEventListener('change', function () {
          // Reduce to purely serializable data, plus an index by ID.
          elem._blazorFilesById = {};
          const fileList = Array.prototype.map.call(elem.files, function (file) {
              const result = {
                  id: ++elem._blazorInputFileNextFileId,
                  lastModified: new Date(file.lastModified).toISOString(),
                  name: file.name,
                  size: file.size,
                  contentType: file.type,
                  readPromise: undefined,
                  arrayBuffer: undefined,
                  blob: file,
              };
              elem._blazorFilesById[result.id] = result;
              return result;
          });
          callbackWrapper.invokeMethodAsync('NotifyChange', fileList);
      });
  }
  async function toImageFile(elem, fileId, format, maxWidth, maxHeight) {
      const originalFile = getFileById(elem, fileId);
      const loadedImage = await new Promise(function (resolve) {
          const originalFileImage = new Image();
          originalFileImage.onload = function () {
              URL.revokeObjectURL(originalFileImage.src);
              resolve(originalFileImage);
          };
          originalFileImage.onerror = function () {
              originalFileImage.onerror = null;
              URL.revokeObjectURL(originalFileImage.src);
          };
          originalFileImage.src = URL.createObjectURL(originalFile['blob']);
      });
      const resizedImageBlob = await new Promise(function (resolve) {
          const desiredWidthRatio = Math.min(1, maxWidth / loadedImage.width);
          const desiredHeightRatio = Math.min(1, maxHeight / loadedImage.height);
          const chosenSizeRatio = Math.min(desiredWidthRatio, desiredHeightRatio);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(loadedImage.width * chosenSizeRatio);
          canvas.height = Math.round(loadedImage.height * chosenSizeRatio);
          canvas.getContext('2d')?.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(resolve, format);
      });
      const result = {
          id: ++elem._blazorInputFileNextFileId,
          lastModified: originalFile.lastModified,
          name: originalFile.name,
          size: resizedImageBlob?.size || 0,
          contentType: format,
          blob: resizedImageBlob ? resizedImageBlob : originalFile.blob,
      };
      elem._blazorFilesById[result.id] = result;
      return result;
  }
  async function readFileData(elem, fileId) {
      const file = getFileById(elem, fileId);
      return file.blob;
  }
  function getFileById(elem, fileId) {
      const file = elem._blazorFilesById[fileId];
      if (!file) {
          throw new Error(`There is no file with ID ${fileId}. The file list may have changed. See https://aka.ms/aspnet/blazor-input-file-multiple-selections.`);
      }
      return file;
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const registeredLocks = new Set();
  const NavigationLock = {
      enableNavigationPrompt,
      disableNavigationPrompt,
  };
  function onBeforeUnload(event) {
      event.preventDefault();
      // Modern browsers display a confirmation prompt when returnValue is some value other than
      // null or undefined.
      // See: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#compatibility_notes
      event.returnValue = true;
  }
  function enableNavigationPrompt(id) {
      if (registeredLocks.size === 0) {
          window.addEventListener('beforeunload', onBeforeUnload);
      }
      registeredLocks.add(id);
  }
  function disableNavigationPrompt(id) {
      registeredLocks.delete(id);
      if (registeredLocks.size === 0) {
          window.removeEventListener('beforeunload', onBeforeUnload);
      }
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  async function getNextChunk(data, position, nextChunkSize) {
      if (data instanceof Blob) {
          return await getChunkFromBlob(data, position, nextChunkSize);
      }
      else {
          return getChunkFromArrayBufferView(data, position, nextChunkSize);
      }
  }
  async function getChunkFromBlob(data, position, nextChunkSize) {
      const chunkBlob = data.slice(position, position + nextChunkSize);
      const arrayBuffer = await chunkBlob.arrayBuffer();
      const nextChunkData = new Uint8Array(arrayBuffer);
      return nextChunkData;
  }
  function getChunkFromArrayBufferView(data, position, nextChunkSize) {
      const nextChunkData = new Uint8Array(data.buffer, data.byteOffset + position, nextChunkSize);
      return nextChunkData;
  }

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  const Blazor = {
      navigateTo,
      registerCustomEventType,
      rootComponents: RootComponentsFunctions,
      runtime: {},
      _internal: {
          navigationManager: internalFunctions,
          domWrapper: domFunctions,
          Virtualize,
          PageTitle,
          InputFile,
          NavigationLock,
          getJSDataStreamChunk: getNextChunk,
          attachWebRendererInterop,
      },
  };
  // Make the following APIs available in global scope for invocation from JS
  window['Blazor'] = Blazor;

  // Licensed to the .NET Foundation under one or more agreements.
  // The .NET Foundation licenses this file to you under the MIT license.
  let requestId = "";
  const commentNodes = document.getRootNode().childNodes;
  for (let i = commentNodes.length - 1; i >= 0; i--) {
      const commentNode = commentNodes[i];
      if (commentNode.nodeType === Node.COMMENT_NODE) {
          requestId = commentNode.nodeValue.substring(10);
          console.log("requestId", requestId);
          break;
      }
  }
  function boot() {
      const initScript = document.getElementById('blazor-initialization');
      if (initScript) {
          debugger;
          // @ts-ignore
          const serializedRenderBatch = initScript.textContent.trim();
          initScript.remove();
          Blazor._internal.navigationManager.enableNavigationInterception(WebRendererId.Server);
          Blazor._internal.navigationManager.listenForNavigationEvents(WebRendererId.Server, (uri, state, intercepted) => {
              console.log("locationChanged", uri, state, intercepted);
              return locationChanged(uri);
          }, (callId, uri, state, intercepted) => {
              console.log("locationChanging", callId, uri, state, intercepted);
              return new Promise((resolve, reject) => { });
          });
          const documentRoot = document.getRootNode();
          const html = documentRoot.children[0];
          const fragment = document.createDocumentFragment();
          fragment.appendChild(html);
          attachRootComponentToLogicalElement(WebRendererId.Server, toLogicalElement(fragment, true), 0, false);
          renderSerializedRenderBatch(serializedRenderBatch);
          let htmlNew = fragment.children[0];
          documentRoot.appendChild(htmlNew);
          const interopMethods = {
              serializeAsArg() {
                  return { ["__dotNetObject"]: 0 };
              },
              dispose() {
              },
              invokeMethod: invokeMethodLightMode,
              invokeMethodAsync: invokeMethodAsyncLightMode,
              // ... include other necessary methods
          };
          attachWebRendererInterop(WebRendererId.Server, interopMethods, undefined, undefined);
      }
  }
  window['DotNet'] = DotNet;
  document.addEventListener("DOMContentLoaded", function (event) {
      boot();
  });
  function renderSerializedRenderBatch(serializedRenderBatch) {
      const binaryBatch = base64ToUint8Array(serializedRenderBatch);
      renderBatch(WebRendererId.Server, new OutOfProcessRenderBatch(binaryBatch));
  }
  function invokeMethodLightMode(methodIdentifier, ...args) {
      console.log("invokeMethodLightMode", methodIdentifier, args);
      return null;
  }
  function invokeMethodAsyncLightMode(methodIdentifier, ...args) {
      return new Promise((resolve, reject) => {
          fetch(`_invokeMethodAsync`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  RequestId: requestId,
                  AssemblyName: null,
                  MethodIdentifier: methodIdentifier,
                  ObjectReference: 0,
                  Arguments: args
              })
          }).then(async (response) => {
              const responseBody = await response.json();
              console.log("invokeMethodAsyncLightMode response", responseBody);
              await renderBatches(responseBody.serializedRenderBatches);
          }).catch(error => {
              console.error("invokeMethodAsyncLightMode error", error);
              reject(error);
          });
      });
  }
  function locationChanged(uri, intercepted) {
      return new Promise((resolve, reject) => {
          fetch(`_locationChanged`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  RequestId: requestId,
                  Location: uri,
              })
          }).then(async (response) => {
              const responseBody = await response.json();
              console.log("locationChanged response", responseBody);
              await renderBatches(responseBody.serializedRenderBatches);
          }).catch(error => {
              console.error("locationChanged error", error);
              reject(error);
          });
      });
  }
  function onAfterRender() {
      return new Promise((resolve, reject) => {
          fetch(`_onAfterRender`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  RequestId: requestId
              })
          }).then(async (response) => {
              const responseBody = await response.json();
              console.log("onAfterRender response", responseBody);
              await renderBatches(responseBody.serializedRenderBatches);
          }).catch(error => {
              console.error("onAfterRender error", error);
              reject(error);
          });
      });
  }
  async function renderBatches(serializedRenderBatches) {
      for (const batch of serializedRenderBatches)
          renderSerializedRenderBatch(batch);
      if (serializedRenderBatches.length > 0)
          await onAfterRender();
  }
  function base64ToUint8Array(base64) {
      const binaryString = atob(base64);
      const binaryLength = binaryString.length;
      const binaryBatch = new Uint8Array(binaryLength);
      for (let i = 0; i < binaryLength; i++) {
          binaryBatch[i] = binaryString.charCodeAt(i);
      }
      return binaryBatch;
  }

})();
//# sourceMappingURL=blazor.lightmode.js.map
