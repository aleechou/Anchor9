/**
 * 
 * 定义锚链的语法： anchor="<element>.<anchor>:<x>,<y>"
 * 
 *      lfttop
 *      lfttop="id"
 *      lfttop="window"
 *      lfttop="body"
 *      lfttop="parent"
 *      lfttop="prev"
 *      lfttop="next"
 *      lfttop="id.rgttop"
 *      lfttop="id.rgttop:20"
 *      lfttop="(selector)")
 *      lfttop="(selector).rgttop:20"[]
 *      lfttop="(selector).rgttop:20"
 * 
 *     lfttop        top          rgttop
 *        O-----------O-------------O
 *        |                         |
 *        |                         |
 *    lft O        center           O rgt
 *        |                         |
 *        |                         |
 *        O-----------O-------------O
 *     lftbtm        btm          rgtbtm
 * 
 * Element 事件：
 * 
 *  update: 当元素被 anchor9 调整过位置/尺寸后触发
 * 
 *  layout: 调用 Anchor9.layout() 方法计算元素的位置/尺寸后触发，用于首次初始化元素在页面内的布局
 * 
 */


;(function(global, undefined){
    
    const MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
    const PNAME = "_$Anchor9"

    Anchor9.version = '0.0.7'

    function Anchor9 (el) {
        if(el && el instanceof HTMLElement) {
            return AnchorableElement(el)
        }
        else {
            this.enable = true
            this.lstAnchorableElements = []
        }
    }

    const LinkTypes = {
        lft: 'lft', rgt: 'rgt', top: 'top', btm: 'btm', center: 'center',
        lfttop: 'lfttop', lftbtm: 'lftbtm', rgttop: 'rgttop', rgtbtm: 'rgtbtm',
        // 别名
        toplft: 'lfttop', toprgt: 'rgttop', btmlft: 'lftbtm', btmrgt: 'rgtbtm',  
    }
    const LinkSelecters = {
        lft: '[lft]', rgt: '[rgt]', top: '[top]', btm: '[btm]', center: '[center]',
        lfttop: '[lfttop],[toplft]', lftbtm: '[lftbtm],[btmlft]', rgttop: '[rgttop],[toprgt]', rgtbtm: '[rgtbtm],[btmrgt]',
    }
    const LinkDirection = {
        lft:    [ 1, 0] ,
        rgt:    [-1, 0] ,
        top:    [ 0, 1] ,
        btm:    [ 0,-1] ,
        lfttop: [ 1, 1] ,
        lftbtm: [ 1,-1] ,
        rgttop: [-1, 1] ,
        rgtbtm: [-1,-1] ,
        center: [ 0, 0] ,
    }
    
    Anchor9.prototype.init = function(rootElement, options) {
        if(!rootElement) rootElement = document.body

        if(!options) {
            options = {
                autoTransform: true
            }
        }

        // 找到html属性里定义的所有锚定关系
        for(var linktype in LinkSelecters) {
            rootElement.querySelectorAll(LinkSelecters[linktype]).forEach((element)=>{
                var anchorable = new AnchorableElement(element, options.autoTransform)

                // 加入到缓存列表
                if(!this.lstAnchorableElements.includes(anchorable))
                    this.lstAnchorableElements.push(anchorable)

                // 连接两个锚定点
                anchorable[linktype].linkByAttrString(element.attributes[linktype].value||linktype)
            })
        }

        this.layout()

        return this
    }

    
    Anchor9.prototype.waitAllElementsUpdateDone = function(cb) {
        setTimeout(()=>{
            for(var anchorable of this.lstAnchorableElements) {
                // 等待所有 anchorable 元素都 update 完毕
                if(anchorable.needUpdate) {
                    setTimeout(()=>{
                        this.waitAllElementsUpdateDone(cb)
                    }, 0)
                    return
                }
            }
            cb()
        }, 0)
    }
    
    Anchor9.prototype.layout = function() {
        if( !this.enable ) return
        this.lstAnchorableElements.forEach(anchorable=>{
            anchorable.update()
        })
        
        this.waitAllElementsUpdateDone(()=>{
            this.lstAnchorableElements.forEach( anchorable => {
                anchorable.element.dispatchEvent(new Event('anchor9.layout')) 
            })
            window.dispatchEvent(new Event('anchor9.layout'))
        })
    }

    function AnchorableElement(element, autoTransform) {
        // AnchorableElement 是 HTML Elment 元素的享元对象
        if(element[PNAME]) {
            return element[PNAME]
        }
        element[PNAME] = this

        this.element    = element
        this.needUpdate = false

        for(var k in LinkDirection) {
            this[k] = new Anchor(this, k)
        }

        this.cacheCoordinateSystemElement = this.coordinateSystemElement()
        this.cacheRect = this.rect()
        this.dbglog = element.attributes && !!element.attributes.dbglog

        if(autoTransform===undefined) {
            if(element.attributes)
                autoTransform = element.attributes.auto===undefined || element.attributes.auto=="true"
            else
                autoTransform = true
        }

        if(element==window) {
            window.addEventListener("resize",()=>this.emitChanged())
        }
        else {
            if(autoTransform) {
                this.elementsObserver = new MutationObserver((mutations)=>{
                    for(var m of mutations) {
                        if( m.type == 'attributes' ) {
                            var attrname = m.attributeName.toLowerCase()
                            if( LinkTypes[attrname] ) {
                                this[attrname].linkByAttrString(element.attributes[m.attributeName].value)
                                this.requestUpdate()
                                return 
                            }
                        }
                    }

                    this.emitChanged()

                    if(this.dbglog)
                        console.log(mutations)
                })
                this.elementsObserver.observe(element, { attributes: true, childList: false, characterData: false, subtree: false })
            }

            
        }
    }

    /**
     * 计算元素的全局坐标
     * parent 链上所有 absolute 元素的 offsetTop/offsetLeft 的和
     * 如果父子链上出现 position: fixed 的元素，则返回值为窗口坐标系
     * 否则则为文档坐标系
     */
    AnchorableElement.prototype.calculateGlobalPosition = function () {
        var pos = { x: 0 , y: 0 }

        // 累加父子链各个 absolute/relative/fixed parent 的坐标
        for(var node=this.element; node; node=node.parentElement) {
            if(node.style.position=='absolute'||node.style.position=='relative'||node.style.position=='fixed') {
                pos.x+= node.offsetLeft
                pos.y+= node.offsetTop

                // 相对窗口坐标
                if(node.style.position=='fixed') {
                    pos.coord = 'window'
                    return pos
                }
            }
        }
        pos.coord = 'document'

        return pos
    }

    AnchorableElement.prototype.coordinateSystemElement = function() {
        if(this.element==window)
            return window
        for(var node=this.element.parentElement; node; node=node.parentElement) {
            if(node.style.position=='absolute'||node.style.position=='relative'||node.style.position=='fixed') {
                return node
            }
        }
        return window
    }

    /**
     * 取得元素的9点值
     * d = 'v', 'h'
     * p = 1, 0, -1
     * local=false 在上级 absolute/fixed 对象的坐标系下，否则为自身坐标系
     */
    const mapAexs = {
        h: ['Left', 'Width'] ,
        v: ['Top', 'Height'] ,
    }
    AnchorableElement.prototype.rectValue = function (d, p, local) {
        var attrs = mapAexs[d]
        var multiple = (1-p)/2

        if(this.element==window) {
            return multiple * window['inner'+attrs[1]]
        }
        else {
            // 隐藏元素
            if( (attrs=='Width' || attrs=='Height') && this.element.style.display == 'none' ){
                return 0
            }
            var base = 0
            if(!local) {
                base = this.element['offset'+attrs[0]]
            }
            return base + multiple * (this.element==window? window['inner'+attrs[1]]: this.element['offset'+attrs[1]]) 
        }
    }
    /**
     * 取得元素的rect对象
     */
    AnchorableElement.prototype.rect = function () {
        return {
            left: this.rectValue('h', 1) ,
            top: this.rectValue('v', 1) ,
            right: this.rectValue('h', -1) ,
            bottom: this.rectValue('v', -1) ,
        }
    }

    /**
     * 检查元素的 rect ，如果发生了变化则返回新的 rect, 否则返回 undefined
     */
    AnchorableElement.prototype.isChanged = function(newRect) {
        if(!newRect)
            newRect = this.rect()
        var changedRect = {}
        var changed = false
        for(var k in newRect) {
            if(newRect[k]!=this.cacheRect[k]) {
                changedRect[k] = newRect[k]
                changed = true
            }
        }
        return changed? changedRect: null
    }
    /**
     * 如果自身的位置和尺寸发生变化，导致自身锚点位置变化，
     * 更新绑定到这些锚点的元素
     */
    AnchorableElement.prototype.emitChanged = function() {
        var newRect = this.rect()
        var changedRect = this.isChanged(newRect)
        if(!changedRect) {
            return
        }

        this.cacheRect = newRect

        for(var k in LinkDirection) {
            this[k]._beLinkeds.forEach(linkedIn=>linkedIn._anchorable.requestUpdate())
        }
    }
    AnchorableElement.prototype.requestUpdate = function() {
        if( this.needUpdate ) return
        this.needUpdate = true
        setTimeout(()=>{
            this.needUpdate = false
            this.update()
        },0)
    }

    /**
     * 根据连接的锚点，更新元素的位置和尺度
     */
    AnchorableElement.prototype.update = function() {

        var rect = {
            x:NaN, y:NaN,
            width: this.element.offsetWidth,
            height: this.element.offsetHeight
        }

        // 计算 x 和 width , 从左往右计算
        this.lfttop.update(rect, 'x')
        this.lft.update(rect, 'x')
        this.lftbtm.update(rect, 'x')
        this.top.update(rect, 'x')
        this.center.update(rect, 'x')
        this.btm.update(rect, 'x')
        this.rgttop.update(rect, 'x')
        this.rgt.update(rect, 'x')
        this.rgtbtm.update(rect, 'x')

        // 计算 y 和 height， 从上往下
        this.lfttop.update(rect, 'y')
        this.top.update(rect, 'y')
        this.rgttop.update(rect, 'y')
        this.lft.update(rect, 'y')
        this.center.update(rect, 'y')
        this.rgt.update(rect, 'y')
        this.lftbtm.update(rect, 'y')
        this.btm.update(rect, 'y')
        this.rgtbtm.update(rect, 'y')

        if(this.dbglog)
            console.log(rect)

        if(!isNaN(rect.x)) {
            this.element.style.left = rect.x + "px"
        }
        if(!isNaN(rect.width) && this.element.offsetWidth!=rect.width) {
            this.element.style.width = rect.width + "px"
        }

        if(!isNaN(rect.y)) {
            this.element.style.top = rect.y + "px"
        }
        if(!isNaN(rect.height) && this.element.offsetHeight!=rect.height) {
            this.element.style.height = rect.height + "px"
        }

        this.element.dispatchEvent(new Event('anchor9.update'))
    }
    
    AnchorableElement.prototype.unlinkAll = function() {
        for(var k in LinkDirection) {
            this[k].unlink()
        }
    }

    /**
     * 锚点
     */
    function Anchor(anchorable, name) {

        this._anchorable = anchorable
        this._name = name
        this._defineAttr = null

        // 刻度信息
        this._scale = {
            x: LinkDirection[name][0] ,
            y: LinkDirection[name][1]
        }

        this._linkTo = null
        this.offset = {
            _x: 0, _y: 0
        }
        defineOffsetProp(this, 'x', '_x')
        defineOffsetProp(this, 'y', '_y')

        this._beLinkeds = []
    }
    function defineOffsetProp(anchor, name, _name) {
        anchor.offset.__defineSetter__(name, function(v){
            if( anchor.offset[_name] != v ) {
                anchor.offset[_name] = v
                anchor._anchorable.requestUpdate()
            }
        })
        anchor.offset.__defineGetter__(name, function(){
            return anchor.offset[_name]
        })
    }
    
    Anchor.prototype.setOffset = function(x,y) {
        this.offset._x = x
        this.offset._y = y
        this._anchorable.requestUpdate()
    }

    Anchor.prototype.positionFromElement = function(local, axe) {
        var pos = {}
        if(!axe) {
            pos.x = this._anchorable.rectValue('h', this._scale.x, local)
            pos.y = this._anchorable.rectValue('v', this._scale.y, local)
        } else {
            pos[axe] = this._anchorable.rectValue(axe=='x'? 'h': 'v', this._scale[axe], local)
        }
        return pos
    }
    
    
    Anchor.prototype.targetByName = function(name) {
        if(name=='window') {
            return window
        } else if(name=='parent' || !name) {
            return this._anchorable.element.parentElement
        }
        // 相邻元素(前)
        else if (name=='previous' || name=='prev') {
            return this._anchorable.element.previousElementSibling
        }
        // 相邻元素(后)
        else if (name=='next') {
            return this._anchorable.element.nextElementSibling
        }
        // 同级元素 sibling(<selector>)
        // @todo

        // selector
        else {
            // 去掉 ()
            if(name[0]=='(' && name[name.length-1]==')')
                name = name.substr(1,name.length-2)
            return document.querySelector(name)
        }
    }

    Anchor.prototype.linkByAttrString = function(attrString) {

        this._defineAttr = attrString
        
        // 偏移
        var arr = attrString.split(":")
        var x = 0, y = 0
        if(arr.length>1) {
            var xy = arr.pop().split(",")
            x = parseFloat(xy[0]) || 0
            y = parseFloat(xy[1]) || 0
            attrString = arr.join(":")
        }

        // 目标锚点的名字
        var toAnchorName = this._name
        arr = attrString.split(".")
        var maybeName = arr.pop()
        if( LinkTypes[maybeName] ) {
            toAnchorName = LinkTypes[maybeName]
        }
        else {
            arr.push(maybeName)
        }
        
        // 目标对象
        var eleString = arr.join('.').trim()
        
        this.link(eleString, toAnchorName, x, y, true)
    }

    Anchor.prototype.link = function(target, anchorName, offsetX, offsetY, dontUpdateImmediately) {

        if(!target) {
            target = this._linkTo? this._linkTo._anchorable.element: 'parent'
        }
        if(typeof(target)=='string') {
            var _target = this.targetByName(target)
            if(!_target) {
                throw new Error('unknow Anchor9 link target: '+target)
            }
            target = _target
        }
        if(!target instanceof HTMLElement) {
            throw new Error('unknow type of Anchor9 link target: '+target)
        }

        var toAnchorable = new AnchorableElement(target)

        if(!anchorName) {
            anchorName = this._linkTo? this._linkTo._name: this._name
        }

        if(offsetX!=undefined)
            this.offset.x = offsetX
        if(offsetY!=undefined)
            this.offset.y = offsetY

        
        let _linkTo = toAnchorable[anchorName]

        if(this._linkTo && this._linkTo!=_linkTo) {
            this.unlink()
        }

        this._linkTo = _linkTo
        // console.log(anchorName, this._linkTo)

        // 加入到to锚点的被锚定列表
        this._linkTo._beLinkeds.push(this)

        // 将对象改为absolute/fixed
        if(this._anchorable.element==window) {
            if(this._anchorable.element.style.position!='fixed')  {
                this._anchorable.element.style.position = 'fixed'
            }
        }
        else {
            if(this._anchorable.element.style.position!='absolute')  {
                this._anchorable.element.style.position = 'absolute'
            }
        }

        if(!dontUpdateImmediately) {
            this._anchorable.requestUpdate()
        }
    }

    Anchor.prototype.unlink = function() {
        if(this._linkTo) {
            // 从to锚点的 被锚定列表中移除自己
            this._linkTo._beLinkeds.splice(this._linkTo._beLinkeds.indexOf(this),1)
            this._linkTo = null
            this.offset.x = null
            this.offset.y = null
        }
    }
    Anchor.prototype.update = function(rect, axe) {
        if( !this._linkTo || this._linkTo.element ) {
            return
        }

        var coorEle = this._anchorable.coordinateSystemElement()

        // 锚定到自己的坐标系元素上
        if( this._linkTo._anchorable.element == coorEle ){
            var pos = this._linkTo.positionFromElement(true, axe)
        }
        else if ( 
            // 锚定对象为 window
            this._linkTo._anchorable.element == window
            // 锚定元素 和 自己 在同一个坐标系中
            || this._linkTo._anchorable.coordinateSystemElement()==coorEle
        ) {
            var pos = this._linkTo.positionFromElement(false, axe)
        }
        else {
            console.error(new Error("必须锚定相同坐标系下的元素("+this._name+"->"+this._linkTo._name+")"))
            console.error(this)
            return
        }

        if(this._anchorable.dbglog) {
            console.log(this._name, '->', this._linkTo._name, pos, 'offset=', this.offset)
        }

        pos[axe]+= this.offset[axe]

        var size = axe=='x'? 'width': 'height'
        // 左或上
        if(this._scale[axe]==1) {
            if(isNaN(rect[axe])){
                rect[axe] = pos[axe]
            }
        }
        // 中间
        else if(this._scale[axe]==0) {
            if(isNaN(rect[axe])){
                rect[axe] = pos[axe] - rect[size]/2
            }
            else {
                rect[size] = (pos[axe]-rect[axe])*2
            }
        }
        // 右或下
        else if(this._scale[axe]==-1) {
            if(isNaN(rect[axe])){
                rect[axe] = pos[axe] - rect[size]
            }
            else {
                rect[size] = (pos[axe]-rect[axe])
            }
        }
    }



    global.Anchor9 = Anchor9
    global._anchorableElement = AnchorableElement
})(this);