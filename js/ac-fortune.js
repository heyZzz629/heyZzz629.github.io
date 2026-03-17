document.addEventListener('DOMContentLoaded', function() {
    // 在这里生成你的公式，我先写个简单的例子，你换成自己的逻辑
    const luckyFormula = {
        tex: "\\boxed{AC = \\sum_{i=1}^{n} Luck_i + Practice}"
    };

    // 1. 先找容器
    const container = document.getElementById('ac-fortune-formula');
    
    if (container) {
        // 2. 填入公式
        container.innerHTML = '$$' + luckyFormula.tex + '$$';
        
        // 3. 触发 Butterfly 的数学渲染 (兼容 KaTeX 和 MathJax)
        setTimeout(() => {
            if (window.renderMathInElement) {
                renderMathInElement(document.body, {
                    delimiters: [{left: '$$', right: '$$', display: true}]
                });
            }
            if (window.MathJax) {
                MathJax.typesetPromise();
            }
        }, 100);
    }
});