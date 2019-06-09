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

    Anchor9.version = '0.0.4'

    function Anchor9 () {
        this.enable = true
        this.lstAnchorableElements = []
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
    
    Anchor9.prototype.init = function(rootElement) {
        if(!rootElement) rootElement = document.body

        // 找到html属性里定义的所有锚定关系
        for(var linktype in LinkSelecters) {
            rootElement.querySelectorAll(LinkSelecters[linktype]).forEach((element)=>{
                var anchorable = new AnchorableElement(element)

                // 加入到缓存列表
                if(!this.lstAnchorableElements.includes(anchorable))
                    this.lstAnchorableElements.push(anchorable)

                // 连接两个锚定点
                anchorable.anchors[linktype].linkByAttrString(element.attributes[linktype].value||linktype)
            })
        }

        this.layout()

        return this
    }
    
    Anchor9.prototype.layout = function() {
        if( !this.enable ) return
        this.lstAnchorableElements.forEach(anchorable=>anchorable.update(true))
    }

    function AnchorableElement(element) {
        // AnchorableElement 是 HTML Elment 元素的享元对象
        if(element[PNAME]) {
            return element[PNAME]
        }
        element[PNAME] = this

        this.element = element
        this.needUpdate = false
        this.anchors = {
            lfttop: new Anchor(this, 'lfttop') ,
            top:    new Anchor(this, 'top') ,
            rgttop: new Anchor(this, 'rgttop') ,
            lft:    new Anchor(this, 'lft') ,
            center: new Anchor(this, 'center') ,
            rgt:    new Anchor(this, 'rgt') ,
            lftbtm: new Anchor(this, 'lftbtm') ,
            btm:    new Anchor(this, 'btm') ,
            rgtbtm: new Anchor(this, 'rgtbtm') ,
        }

        this.cacheCoordinateSystemElement = this.coordinateSystemElement()
        this.cacheRect = this.rect()
        this.dbglog = element.attributes && !!element.attributes.dbglog
        this._handles = []

        if(element==window) {
            window.addEventListener("resize",()=>this.emitChanged())
        }
        else {
            this.elementsObserver = new MutationObserver((mutations)=>{
                this.emitChanged()
                if(this.dbglog)
                    console.log(mutations)
            })
            this.elementsObserver.observe(element, { attributes: true, childList: true, characterData: true, subtree: true })
        }
    }

    AnchorableElement.prototype.on = function(cb) {
        this._handles.push(cb)
    }
    AnchorableElement.prototype.off = function(cb) {
        var idx = this._handles.indexOf(cb)
        if(idx>=0)
            this._handles.splice(idx,1)
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
        if(!changedRect) return

        this.cacheRect = newRect

        // 触发事件
        this._handles.forEach((cb)=>cb(changedRect))

        for(var k in this.anchors) {
            this.anchors[k].beLinkeds.forEach(linkedIn=>linkedIn.anchorable.requestUpdate())
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
    AnchorableElement.prototype.update = function(isLayout) {

        var rect = {
            x:NaN, y:NaN,
            width: this.element.offsetWidth,
            height: this.element.offsetHeight
        }

        // 计算 x 和 width , 从左往右计算
        this.anchors.lfttop.update(rect, 'x')
        this.anchors.lft.update(rect, 'x')
        this.anchors.lftbtm.update(rect, 'x')
        this.anchors.top.update(rect, 'x')
        this.anchors.center.update(rect, 'x')
        this.anchors.btm.update(rect, 'x')
        this.anchors.rgttop.update(rect, 'x')
        this.anchors.rgt.update(rect, 'x')
        this.anchors.rgtbtm.update(rect, 'x')

        // 计算 y 和 height， 从上往下
        this.anchors.lfttop.update(rect, 'y')
        this.anchors.top.update(rect, 'y')
        this.anchors.rgttop.update(rect, 'y')
        this.anchors.lft.update(rect, 'y')
        this.anchors.center.update(rect, 'y')
        this.anchors.rgt.update(rect, 'y')
        this.anchors.lftbtm.update(rect, 'y')
        this.anchors.btm.update(rect, 'y')
        this.anchors.rgtbtm.update(rect, 'y')

        if(this.dbglog)
            console.log(rect)

        if(!isNaN(rect.x)) {
            this.element.style.left = rect.x + "px"
        }
        if(!isNaN(rect.width) && this.element.offsetWidth!=rect.width) {
            // console.log(this.element, this.element.style.width, ",", rect.width)
            this.element.style.width = rect.width + "px"
        }

        if(!isNaN(rect.y)) {
            this.element.style.top = rect.y + "px"
        }
        if(!isNaN(rect.height) && this.element.offsetHeight!=rect.height) {
            this.element.style.height = rect.height + "px"
        }

        this.element.dispatchEvent(new Event('anchor9.update'))

        if(isLayout) {
            this.element.dispatchEvent(new Event('anchor9.layout'))
        }
    }

    /**
     * 锚点
     */
    function Anchor(anchorable, name) {

        this.anchorable = anchorable
        this.name = name

        // 刻度信息
        this.scale = {
            x: LinkDirection[name][0] ,
            y: LinkDirection[name][1]
        }

        this.linkTo = null
        this.linkOffset = {
            x: 0, y: 0
        }
        this.linkString = null

        this.beLinkeds = []
    }
    Anchor.prototype.positionFromElement = function(local, axe) {
        var pos = {}
        if(!axe) {
            pos.x = this.anchorable.rectValue('h', this.scale.x, local)
            pos.y = this.anchorable.rectValue('v', this.scale.y, local)
        } else {
            pos[axe] = this.anchorable.rectValue(axe=='x'? 'h': 'v', this.scale[axe], local)
        }
        return pos
    }
    
    Anchor.prototype.linkByAttrString = function(attrString) {
        if(this.linkTo) {
            this.unlink()
        }
        
        // 偏移
        var arr = attrString.split(":")
        if(arr.length>1) {
            var xy = arr.pop().split(",")
            this.linkOffset.x = parseFloat(xy[0]) || 0
            this.linkOffset.y = parseFloat(xy[1]) || 0
            attrString = arr.join(":")
        }

        // 目标锚点的名字
        var toAnchorName = this.name
        arr = attrString.split(".")
        var maybeName = arr.pop()
        if( LinkTypes[maybeName] ) {
            toAnchorName = LinkTypes[maybeName]
        }
        else {
            arr.push(maybeName)
        }
        var eleString = arr.join('.').trim()

        // 目标对象
        var toElement = null
        if(eleString=='window') {
            toElement = window
        } else if(eleString=='parent' || !eleString) {
            toElement = this.anchorable.element.parentElement
        }
        // 相邻元素(前)
        else if (eleString=='previous' || eleString=='prev') {
            toElement = this.anchorable.element.previousElementSibling
        }
        // 相邻元素(后)
        else if (eleString=='next') {
            toElement = this.anchorable.element.nextElementSibling
        }
        // 同级元素 sibling(<selector>)
        // @todo

        // selector
        else {
            // 去掉 ()
            if(eleString[0]=='(' && eleString[eleString.length-1]==')')
                eleString = eleString.substr(1,eleString.length-2)
            toElement = document.querySelector(eleString)
        }

        if(toElement) {
            this.linkTo = new AnchorableElement(toElement).anchors[toAnchorName]

            // 加入到to锚点的被锚定列表
            this.linkTo.beLinkeds.push(this)

            // 将对象改为absolute/fixed
            if(toElement==window) {
                if(this.anchorable.element.style.position!='fixed')  {
                    this.anchorable.element.style.position = 'fixed'
                }
            }
            else {
                if(this.anchorable.element.style.position!='absolute')  {
                    this.anchorable.element.style.position = 'absolute'
                }
            }
        }
    }

    Anchor.prototype.unlink = function() {
        if(this.linkTo) {
            // 从to锚点的 被锚定列表中移除自己
            this.linkTo.beLinkeds.splice(this.linkTo.beLinkeds.indexOf(this),1)
            this.linkTo = null
        }
    }
    Anchor.prototype.update = function(rect, axe) {
        if( !this.linkTo || this.linkTo.element ) {
            return
        }

        var coorEle = this.anchorable.coordinateSystemElement()

        // 锚定到自己的坐标系元素上
        if( this.linkTo.anchorable.element == coorEle ){
            var pos = this.linkTo.positionFromElement(true, axe)
        }
        else if ( 
            // 锚定对象为 window
            this.linkTo.anchorable.element == window
            // 锚定元素 和 自己 在同一个坐标系中
            || this.linkTo.anchorable.coordinateSystemElement()==coorEle
        ) {
            var pos = this.linkTo.positionFromElement(false, axe)
        }
        else {
            console.error(new Error("必须锚定相同坐标系下的元素("+this.name+"->"+this.linkTo.name+")"))
            console.error(this)
            return
        }

        if(this.anchorable.dbglog) {
            console.log(this.name, '->', this.linkTo.name, pos, 'offset=', this.linkOffset)
        }

        pos[axe]+= this.linkOffset[axe]

        var size = axe=='x'? 'width': 'height'
        // 左或上
        if(this.scale[axe]==1) {
            if(isNaN(rect[axe])){
                rect[axe] = pos[axe]
            }
        }
        // 中间
        else if(this.scale[axe]==0) {
            if(isNaN(rect[axe])){
                rect[axe] = pos[axe] - rect[size]/2
            }
            else {
                rect[size] = (pos[axe]-rect[axe])*2
            }
        }
        // 右或下
        else if(this.scale[axe]==-1) {
            if(isNaN(rect[axe])){
                rect[axe] = pos[axe] - rect[size]
            }
            else {
                rect[size] = (pos[axe]-rect[axe])
            }
        }
    }



    global.Anchor9 = Anchor9
    global.AnchorableElement = AnchorableElement
})(this);