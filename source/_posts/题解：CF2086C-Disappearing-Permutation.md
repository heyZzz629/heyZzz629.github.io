---
title: 题解：CF2086C Disappearing Permutation
date: 2026-03-09 20:19:39
tags:
  - 题解
categories:
  - 题解
---
## 题意

给定两个排列 $p$ 和 $d$，第 $1 \le i \le n$ 次将 $p_{d_i}$  设为 0。

然后进行操作，一次操作定义为指定一个 $i$，将 $a_i = i$，问最少多少次操作能将它复原为一个排列（可能与原排列相同）。

## 思路

我一看，每次 $p_{i}$ 一定要做一次操作 $p_i=i$，那么 $p_{p_i}$ 也要操作，以此类推，直到 $p_k$ 等于 $k$。

那就好办了，每次讲 $p_i$ 和 $i$ 连在一起，分成几个联通块，每次的答案就是联通块的大小。

## code

```cpp
#include<bits/stdc++.h>
#define int long long
using namespace std;
int T,n,p[100005],d[100005],f[100005],sz[100005],fg[100005],ans;
int fd(int x){
    if(f[x]==x) return x;
    return f[x]=fd(f[x]);
}
signed main(){
    cin>>T;
    while(T--){
        cin>>n,ans=0;
        for(int i=1;i<=n;i++) f[i]=i,sz[i]=1,fg[i]=0;
        for(int i=1;i<=n;i++){
            cin>>p[i];
            if(fd(p[i])!=fd(i))
                sz[fd(i)]+=sz[fd(p[i])],f[fd(p[i])]=fd(i);
        }for(int i=1;i<=n;i++){
            cin>>d[i];
            if(!fg[fd(d[i])]) fg[fd(d[i])]=1,ans+=sz[fd(d[i])];
            cout<<ans<<' ';
        }cout<<'\n';
    }
}
```