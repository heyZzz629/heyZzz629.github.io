---
title: 题解：CF1526C1 Potions (Easy Version)
date: 2026-03-09 20:19:43
tags:
---
思路 1：

使用动态规划算法，$f_i$ 是表示喝 $i$ 瓶药的最大值。

可以得出：$f_j=\max(f_j,f_{j-1}+a_j)$。

关键代码：

```cpp
for(int i=1;i<=n;i++)
    for(int j=i;j;j--)
        if(f[j-1]+a[i]>=0)
             f[j]=max(f[j],f[j-1]+a[i]);
```

时间复杂度：$O(n^2)$。

思路 2：

使用贪心算法+优先队列。


先拼劲全力去喝，如果在这道题中喝药喝死了，我们就要将他把药吐出来。

关键代码：


```cpp
for(int i=1;i<=n;i++){
    sum+=f[i],q.push(-f[i]);
    if(sum<0){
        p=q.top(),q.pop();
        p=-p,sum-=p,t++;
    }
}
```

时间复杂度：$O(n \log_2 n)$。